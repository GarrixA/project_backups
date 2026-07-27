#!/usr/bin/env bash
# Deletes the oldest half of Firestore backup files under one project folder
# (or all project folders when BACKUP_DIR=backups and PRUNE_ALL=1).
#
# Usage:
#   BACKUP_DIR=backups/golden-k-tech-dev bash .github/scripts/prune-backups.sh
#   PRUNE_ALL=1 bash .github/scripts/prune-backups.sh
set -euo pipefail

prune_one_dir() {
  local BACKUP_DIR="$1"
  local files sorted count to_delete i

  shopt -s nullglob
  files=("$BACKUP_DIR"/firestore-backup-*.json)
  IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
  unset IFS

  count=${#sorted[@]}
  to_delete=$((count / 2))

  if [ "$count" -eq 0 ]; then
    echo "No backup files found in $BACKUP_DIR"
    return 0
  fi

  echo "Found $count backup(s) in $BACKUP_DIR; deleting oldest $to_delete"

  if [ "$to_delete" -eq 0 ]; then
    echo "Nothing to delete in $BACKUP_DIR (need at least 2 backups)"
    return 0
  fi

  for ((i = 0; i < to_delete; i++)); do
    echo "Removing ${sorted[$i]}"
    rm -f "${sorted[$i]}"
  done

  echo "Kept $((count - to_delete)) newer backup(s) in $BACKUP_DIR"
}

if [ "${PRUNE_ALL:-0}" = "1" ]; then
  shopt -s nullglob
  for dir in backups/*/; do
    [ -d "$dir" ] || continue
    prune_one_dir "${dir%/}"
  done
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-backups}"
prune_one_dir "$BACKUP_DIR"
