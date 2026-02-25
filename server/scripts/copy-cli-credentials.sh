#!/bin/bash
# Copy CLI credentials from root to cliuser
# Run this after logging in via the browser terminal

echo "Copying Claude credentials..."
if [ -f /root/.claude/.credentials.json ]; then
    cp /root/.claude/.credentials.json /home/cliuser/.claude/.credentials.json
    cp /root/.claude.json /home/cliuser/.claude.json 2>/dev/null
    chown cliuser:cliuser /home/cliuser/.claude/.credentials.json
    chown cliuser:cliuser /home/cliuser/.claude.json 2>/dev/null
    chmod 600 /home/cliuser/.claude/.credentials.json
    echo "  Claude credentials copied successfully"
else
    echo "  No Claude credentials found in /root/.claude/"
fi

echo "Copying Gemini credentials..."
if [ -f /root/.gemini/oauth_creds.json ]; then
    cp -r /root/.gemini/* /home/cliuser/.gemini/
    chown -R cliuser:cliuser /home/cliuser/.gemini/
    chmod 600 /home/cliuser/.gemini/oauth_creds.json
    echo "  Gemini credentials copied successfully"
else
    echo "  No Gemini credentials found in /root/.gemini/"
fi

echo "Done! Test with:"
echo "  docker exec -u cliuser swarm-backend claude -p 'Say hello'"
echo "  docker exec -u cliuser swarm-backend gemini -p 'Say hello'"
