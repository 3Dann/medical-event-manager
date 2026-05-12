"""Unit tests for backup module."""
import os, sys, tempfile, gzip, sqlite3
sys.path.insert(0, os.path.dirname(__file__))

import backup


def test_db_snapshot():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as src_f:
        src = src_f.name
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as dst_f:
        dst = dst_f.name
    try:
        conn = sqlite3.connect(src)
        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
        conn.execute("INSERT INTO t VALUES (1, 'hello')")
        conn.commit()
        conn.close()

        original_db = backup.DB_PATH
        backup.DB_PATH = src
        backup._db_snapshot(dst)
        backup.DB_PATH = original_db

        conn2 = sqlite3.connect(dst)
        row = conn2.execute("SELECT val FROM t WHERE id=1").fetchone()
        conn2.close()
        assert row[0] == "hello", f"Expected 'hello', got {row[0]}"
    finally:
        os.unlink(src)
        os.unlink(dst)


def test_compress():
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
        f.write(b"test data " * 100)
        src = f.name
    gz = src + ".gz"
    try:
        backup._compress(src, gz)
        with gzip.open(gz, "rb") as f:
            content = f.read()
        assert content == b"test data " * 100
    finally:
        os.unlink(src)
        if os.path.exists(gz):
            os.unlink(gz)


def test_prune_local():
    import pathlib
    with tempfile.TemporaryDirectory() as tmpdir:
        d = pathlib.Path(tmpdir)
        for i in range(10):
            (d / f"medical_event_manager_2026050{i}.db.gz").write_bytes(b"x")
        original_max = backup.MAX_LOCAL_BACKUPS
        backup.MAX_LOCAL_BACKUPS = 3
        backup._prune_local(d)
        backup.MAX_LOCAL_BACKUPS = original_max
        remaining = list(d.glob("*.db.gz"))
        assert len(remaining) == 3, f"Expected 3, got {len(remaining)}"


if __name__ == "__main__":
    test_db_snapshot()
    print("✅ test_db_snapshot passed")
    test_compress()
    print("✅ test_compress passed")
    test_prune_local()
    print("✅ test_prune_local passed")
    print("✅ All backup tests passed")
