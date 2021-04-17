#!/bin/bash
pid=$(ps -ef | grep 'node daemon.js'|grep -v grep|awk '{print $2}')
if [ -n "$pid" ]; then
    echo "kill: $pid"
    kill -9 $pid;
fi