import importlib.util
import pathlib
import sys
import unittest


SCRIPT = pathlib.Path(__file__).parents[1] / "host_maintenance.py"
SPEC = importlib.util.spec_from_file_location("pagev3_host_maintenance", SCRIPT)
maintenance = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = maintenance
SPEC.loader.exec_module(maintenance)


def df_output(size="8.5GB", reclaimable="6.2GB (72%)", total="10", active="2"):
    return '\n'.join([
        '{"Type":"Images","TotalCount":"5","Active":"2","Size":"1.2GB","Reclaimable":"100MB (8%)"}',
        '{"Type":"Build Cache","TotalCount":"' + total + '","Active":"' + active + '","Size":"' + size + '","Reclaimable":"' + reclaimable + '"}',
    ])


class FakeDocker:
    def __init__(self, inventories):
        self.inventories = list(inventories)
        self.calls = []

    def __call__(self, args, timeout):
        self.calls.append((args, timeout))
        if args[:2] == ["system", "df"]:
            return self.inventories.pop(0)
        if args == ["builder", "prune", "--force"]:
            return "Total reclaimed space: 6.2GB"
        raise AssertionError("unexpected docker operation")


class HostMaintenanceTests(unittest.TestCase):
    def test_parse_system_df_reads_only_build_cache_and_units(self):
        result = maintenance.parse_system_df(df_output())
        self.assertEqual(result, {
            "totalEntries": 10,
            "activeEntries": 2,
            "sizeBytes": 8_500_000_000,
            "reclaimableBytes": 6_200_000_000,
            "reclaimableEntries": 8,
        })
        self.assertEqual(maintenance.parse_size_bytes("1.5 GiB"), int(1.5 * 1024 ** 3))

    def test_preview_requires_exact_followup_and_prunes_only_build_cache(self):
        docker = FakeDocker([
            df_output(),
            df_output(),
            df_output(reclaimable="0B (0%)", total="2", active="2"),
        ])
        agent = maintenance.BuildCacheAgent(run_docker=docker, token_factory=lambda: "a" * 32)

        preview = agent.preview()
        result = agent.prune(preview["token"])

        self.assertEqual(result["reclaimedBytes"], 6_200_000_000)
        self.assertEqual([call[0] for call in docker.calls], [
            ["system", "df", "--format", "{{json .}}"],
            ["system", "df", "--format", "{{json .}}"],
            ["builder", "prune", "--force"],
            ["system", "df", "--format", "{{json .}}"],
        ])

    def test_snapshot_change_expiry_and_replay_do_not_prune(self):
        docker = FakeDocker([df_output(), df_output(size="9GB")])
        clock = [10.0]
        agent = maintenance.BuildCacheAgent(run_docker=docker, clock=lambda: clock[0], token_factory=lambda: "b" * 32)
        token = agent.preview()["token"]
        with self.assertRaises(maintenance.MaintenanceError) as stale:
            agent.prune(token)
        self.assertEqual(stale.exception.code, "preview_stale")
        self.assertEqual(len(docker.calls), 2)

        expired_docker = FakeDocker([df_output()])
        expired = maintenance.BuildCacheAgent(run_docker=expired_docker, clock=lambda: clock[0], token_factory=lambda: "c" * 32)
        expired_token = expired.preview()["token"]
        clock[0] += maintenance.TOKEN_TTL_SECONDS
        with self.assertRaises(maintenance.MaintenanceError) as timeout:
            expired.prune(expired_token)
        self.assertEqual(timeout.exception.code, "preview_expired")
        self.assertEqual(len(expired_docker.calls), 1)

    def test_unrecognized_operations_never_reach_docker(self):
        docker = FakeDocker([])
        agent = maintenance.BuildCacheAgent(run_docker=docker)
        for payload in [
            {"op": "exec", "command": "rm -rf /"},
            {"op": "prune", "token": "a" * 32, "args": ["image", "prune"]},
            {"op": "prune", "token": "invalid"},
        ]:
            with self.assertRaises(maintenance.MaintenanceError):
                maintenance.handle_request(payload, agent)
        self.assertEqual(docker.calls, [])

    def test_no_reclaimable_cache_has_no_prune_token(self):
        docker = FakeDocker([df_output(reclaimable="0B (0%)", total="4", active="4")])
        agent = maintenance.BuildCacheAgent(run_docker=docker)
        preview = agent.preview()
        self.assertEqual(preview["token"], "")
        self.assertEqual(preview["reclaimableBytes"], 0)


if __name__ == "__main__":
    unittest.main()
