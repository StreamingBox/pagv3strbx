#!/usr/bin/env python3
import os
import stat
import sys
import tempfile


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: update-gmail-imap-pass.py /path/to/.env")

    env_path = sys.argv[1]
    new_password = sys.stdin.read().strip().replace(" ", "")
    if len(new_password) != 16:
        raise SystemExit("The Gmail app password must contain 16 characters.")

    source_stat = os.stat(env_path)
    with open(env_path, "r", encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    replacement = f"GMAIL_IMAP_PASS={new_password}"
    replaced = False
    for index, line in enumerate(lines):
        if line.startswith("GMAIL_IMAP_PASS="):
            lines[index] = replacement
            replaced = True
            break
    if not replaced:
        lines.append(replacement)

    fd, temp_path = tempfile.mkstemp(prefix=".env.", dir=os.path.dirname(env_path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
        os.chown(temp_path, source_stat.st_uid, source_stat.st_gid)
        os.chmod(temp_path, stat.S_IMODE(source_stat.st_mode))
        os.replace(temp_path, env_path)
    except Exception:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
        raise

    print("GMAIL_IMAP_PASS updated")


if __name__ == "__main__":
    main()
