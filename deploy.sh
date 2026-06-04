#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Community Events App — One-Command Deploy Script
# Run from the App folder: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Stop on any error

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Community Events — Deploy Script             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check we're in the right folder ───────────────────────────────────
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found."
  echo "   Please run this script from the App folder."
  echo "   Example: cd App && bash deploy.sh"
  exit 1
fi

PROJECT=$(grep -o '"community-event-[^"]*"' .firebaserc 2>/dev/null | tr -d '"' || echo "community-event-8b639")
echo "📁 Project: $PROJECT"
echo ""

# ── Step 2: Choose what to deploy ────────────────────────────────────────────
echo "What would you like to deploy?"
echo "  1) Everything (hosting + functions)"
echo "  2) Hosting only (frontend)"
echo "  3) Functions only (backend)"
echo ""
read -p "Enter choice [1/2/3] (default: 1): " CHOICE
CHOICE=${CHOICE:-1}

case $CHOICE in
  2) DEPLOY_TARGET="--only hosting" ;;
  3) DEPLOY_TARGET="--only functions" ;;
  *) DEPLOY_TARGET="" ;;
esac

echo ""

# ── Step 3: Install dependencies ─────────────────────────────────────────────
echo "📦 Installing frontend dependencies..."
npm install --silent
echo "✅ Frontend dependencies ready"
echo ""

if [ -z "$DEPLOY_TARGET" ] || [ "$DEPLOY_TARGET" = "--only functions" ]; then
  echo "📦 Installing functions dependencies..."
  cd functions && npm install --silent && cd ..
  echo "✅ Functions dependencies ready"
  echo ""
fi

# ── Step 4: Build frontend ────────────────────────────────────────────────────
if [ -z "$DEPLOY_TARGET" ] || [ "$DEPLOY_TARGET" = "--only hosting" ]; then
  echo "🔨 Building frontend..."
  npm run build
  echo "✅ Build complete"
  echo ""
fi

# ── Step 5: Deploy ────────────────────────────────────────────────────────────
echo "🚀 Deploying to Firebase..."
echo ""

if [ -z "$DEPLOY_TARGET" ]; then
  firebase deploy
else
  firebase deploy $DEPLOY_TARGET
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ Deployment complete!                         ║"
echo "║  🌐 https://ce.sajjadzaheer.com                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
