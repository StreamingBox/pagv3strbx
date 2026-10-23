#!/usr/bin/python3
"""Small, allowlisted host maintenance agent for the PageV3 Telegram admin bot."""

import json
import os
import re
import secrets
import shutil
import socket
import socketserver
import stat
import subprocess
import threading
import time
from pathlib import Path


SOCKET_PATH = Path(os.environ.get("PAGEV3_MAINTENANCE_SOCKET", "/run/pagev3-maintenance/agent.sock"))
SOCKET_GID = int(os.environ.get("PAGEV3_MAINTENANCE_GID", "1000"))
TOKEN_PATTERN = re.compile(r"^[a-f0-9]{32}$")
SIZE_PATTERN = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(B|bytes?|kB|KB|KiB|MB|MiB|GB|GiB|TB|TiB)?\s*$", re.IGNORECASE)
TOKEN_TTL_SECONDS = 300
MAX_REQUEST_BYTES = 4096
MAX_RESPONSE_BYTES = 8192
DOCKER = shutil.which("docker") or "/usr/bin/docker"
DOCKER_BASE = [DOCKER, "--host=unix:///var/run/docker.sock"]


class MaintenanceError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def parse_size_bytes(value):
    match = SIZE_PATTERN.fullmatch(str(value or ""))
    if not match:
        raise MaintenanceError("docker_output_invalid")
    amount = float(match.group(1))
    unit = (match.group(2) or "B").lower()
    powers = {
        "b": 1, "byte": 1, "bytes": 1,
        "kb": 1000, "kib": 1024,
        "mb": 1000 ** 2, "mib": 1024 ** 2,
        "gb": 1000 ** 3, "gib": 1024 ** 3,
        "tb": 1000 ** 4, "tib": 1024 ** 4,
    }
    return int(amount * powers[unit])


def parse_count(value):
    try:
        result = int(value)
    except (TypeError, ValueError):
        raise MaintenanceError("docker_output_invalid") from None
    if result < 0:
        raise MaintenanceError("docker_output_invalid")
    return result


def parse_system_df(output):
    try:
        rows = [json.loads(line) for line in output.splitlines() if line.strip()]
    except json.JSONDecodeError:
        raise MaintenanceError("docker_output_invalid") from None

    cache = next((row for row in rows if row.get("Type") == "Build Cache"), None)
    if not cache:
        return {
            "totalEntries": 0,
            "activeEntries": 0,
            "sizeBytes": 0,
            "reclaimableBytes": 0,
            "reclaimableEntries": 0,
        }

    reclaimable = str(cache.get("Reclaimable", "0B")).split("(", 1)[0].strip()
    total_entries = parse_count(cache.get("TotalCount", 0))
    active_entries = parse_count(cache.get("Active", 0))
    return {
        "totalEntries": total_entries,
        "activeEntries": active_entries,
        "sizeBytes": parse_size_bytes(cache.get("Size", "0B")),
        "reclaimableBytes": parse_size_bytes(reclaimable),
        "reclaimableEntries": max(0, total_entries - active_entries),
    }


class BuildCacheAgent:
    def __init__(self, run_docker=None, clock=time.monotonic, token_factory=None):
        self._run_docker = run_docker or self._run_docker_command
        self._clock = clock
        self._token_factory = token_factory or (lambda: secrets.token_hex(16))
        self._pending = {}
        self._lock = threading.Lock()

    @staticmethod
    def _run_docker_command(args, timeout):
        try:
            completed = subprocess.run(
                DOCKER_BASE + args,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"},
            )
        except (OSError, subprocess.TimeoutExpired):
            raise MaintenanceError("docker_command_failed") from None
        if completed.returncode != 0:
            raise MaintenanceError("docker_command_failed")
        return completed.stdout

    def _inventory(self):
        output = self._run_docker(["system", "df", "--format", "{{json .}}"], timeout=30)
        return parse_system_df(output)

    def _expire_tokens(self):
        now = self._clock()
        for token, (created_at, _) in list(self._pending.items()):
            if now - created_at >= TOKEN_TTL_SECONDS:
                del self._pending[token]

    def preview(self):
        with self._lock:
            self._expire_tokens()
            inventory = self._inventory()
            token = self._token_factory() if inventory["reclaimableBytes"] else ""
            if token:
                if not TOKEN_PATTERN.fullmatch(token):
                    raise MaintenanceError("token_generation_failed")
                self._pending[token] = (self._clock(), inventory.copy())
                while len(self._pending) > 64:
                    del self._pending[next(iter(self._pending))]
            return {"ok": True, "token": token, "expiresInSeconds": TOKEN_TTL_SECONDS, **inventory}

    def prune(self, token):
        if not isinstance(token, str) or not TOKEN_PATTERN.fullmatch(token):
            raise MaintenanceError("invalid_token")
        with self._lock:
            self._expire_tokens()
            preview = self._pending.pop(token, None)
            if not preview:
                raise MaintenanceError("preview_expired")
            created_at, before = preview
            if self._clock() - created_at >= TOKEN_TTL_SECONDS:
                raise MaintenanceError("preview_expired")
            current = self._inventory()
            if current != before:
                raise MaintenanceError("preview_stale")
            if not before["reclaimableBytes"]:
                raise MaintenanceError("nothing_to_prune")

            self._run_docker(["builder", "prune", "--force"], timeout=15 * 60)
            after = self._inventory()
            return {
                "ok": True,
                "before": before,
                "after": after,
                "reclaimedBytes": max(0, before["reclaimableBytes"] - after["reclaimableBytes"]),
            }


AGENT = BuildCacheAgent()


def handle_request(payload, agent=AGENT):
    if not isinstance(payload, dict):
        raise MaintenanceError("invalid_request")
    op = payload.get("op")
    if op == "preview" and set(payload) == {"op"}:
        return agent.preview()
    if op == "prune" and set(payload) == {"op", "token"}:
        return agent.prune(payload.get("token"))
    raise MaintenanceError("invalid_request")


class MaintenanceRequestHandler(socketserver.StreamRequestHandler):
    def handle(self):
        raw = self.rfile.readline(MAX_REQUEST_BYTES + 1)
        if not raw or len(raw) > MAX_REQUEST_BYTES or not raw.endswith(b"\n"):
            response = {"ok": False, "error": "invalid_request"}
        else:
            try:
                payload = json.loads(raw.decode("utf-8"))
                response = handle_request(payload)
            except (UnicodeDecodeError, json.JSONDecodeError):
                response = {"ok": False, "error": "invalid_request"}
            except MaintenanceError as error:
                response = {"ok": False, "error": error.code}
            except Exception:
                response = {"ok": False, "error": "maintenance_failed"}
        encoded = (json.dumps(response, separators=(",", ":")) + "\n").encode("utf-8")
        if len(encoded) <= MAX_RESPONSE_BYTES:
            self.wfile.write(encoded)


if hasattr(socketserver, "UnixStreamServer"):
    class UnixMaintenanceServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
        daemon_threads = True
        allow_reuse_address = False
else:
    class UnixMaintenanceServer:
        pass


def prepare_socket_path(path):
    path.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    os.chown(path.parent, 0, SOCKET_GID)
    os.chmod(path.parent, 0o750)
    if path.exists() or path.is_symlink():
        if not stat.S_ISSOCK(path.stat().st_mode):
            raise RuntimeError("maintenance socket path is not a socket")
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
                probe.settimeout(0.2)
                probe.connect(str(path))
            raise RuntimeError("maintenance agent already owns the socket")
        except (ConnectionRefusedError, FileNotFoundError, TimeoutError, OSError):
            path.unlink()


def serve():
    if not hasattr(socketserver, "UnixStreamServer"):
        raise RuntimeError("the host maintenance agent requires Unix-domain sockets")
    prepare_socket_path(SOCKET_PATH)
    old_umask = os.umask(0o117)
    try:
        server = UnixMaintenanceServer(str(SOCKET_PATH), MaintenanceRequestHandler)
    finally:
        os.umask(old_umask)
    os.chown(SOCKET_PATH, 0, SOCKET_GID)
    os.chmod(SOCKET_PATH, 0o660)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    serve()
