#!/bin/bash
# Setup git hooks — run once on every machine after cloning/pulling
# Usage: ./setup_hooks.sh

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/post-commit"

cat > "$HOOK" << 'EOF'
#!/bin/sh
cd "$(git rev-parse --show-toplevel)"
python3 generate_progress.py 2>/dev/null &
EOF

chmod +x "$HOOK"
echo "✅ post-commit hook installed"

# First run
python3 "$REPO_ROOT/generate_progress.py"
