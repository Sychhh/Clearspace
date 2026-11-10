#!/bin/sh
set -eu
# A newly mounted disk can mask the image directory's original ownership.
mkdir -p /var/data
chown -R node:node /var/data
exec gosu node "$@"
