#!/usr/bin/env bash

# from Meteor local checkout run like
# ./packages/test-in-console/run.sh
# or for a specific package
# ./packages/test-in-console/run.sh "mongo"

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

# Set CI-specific environment variables
if [ "$CI" = "true" ] || [ -n "$TRAVIS" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$CIRCLECI" ]; then
  # Only set CI_TIMEOUT if not already provided
  if [ -z "$CI_TIMEOUT" ]; then
    if [ -n "$TRAVIS" ]; then
      export CI_TIMEOUT=600000  # 10 minutes for Travis CI (longer timeout)
    else
      export CI_TIMEOUT=300000  # 5 minutes for other CI environments
    fi
  fi
  export METEOR_NO_DEPRECATION=1  # Suppress deprecation warnings in CI
  
  # Travis CI specific optimizations
  if [ -n "$TRAVIS" ]; then
    export NODE_OPTIONS="--max-old-space-size=4096"  # Increase memory for Travis
    export METEOR_TEST_TMP="/tmp"  # Use faster temp directory
  fi
  
  echo "CI environment detected - setting enhanced timeouts and suppressing deprecations"
fi

# Installs into dev_bundle/lib/node_modules/puppeteer.
./meteor npm install -g puppeteer@23.6.0

export PATH=$METEOR_HOME:$PATH

export URL='http://127.0.0.1:4096/'
export METEOR_PACKAGE_DIRS='packages/deprecated'

exec 3< <(./meteor test-packages --driver-package test-in-console -p 4096 --exclude ${TEST_PACKAGES_EXCLUDE:-''} $1)
EXEC_PID=$!
trap "pkill -TERM -P $EXEC_PID; exit 1" SIGINT

sed '/test-in-console listening$/q' <&3

node --trace-warnings "$METEOR_HOME/packages/test-in-console/puppeteer_runner.js"

STATUS=$?

pkill -TERM -P $EXEC_PID
exit $STATUS
