#!/bin/bash

set -e  # Exit on any error

dotnet build src/backend

cd src/renderer
npm install

cd ../desktop
npm install

cd ../..

(cd src/renderer && npm run start) &
ANGULAR_PID=$!

until curl -s http://localhost:4200 > /dev/null 2>&1; do
    sleep 1
done

cd src/desktop
npm start

trap "kill $ANGULAR_PID 2>/dev/null" EXIT

cd ../..