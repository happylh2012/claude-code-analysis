#!/bin/bash
# 推送到 GitHub 的完整脚本

set -e

REPO_NAME="claude-code-analysis"
GITHUB_USER="clawdai"  # 修改为你的 GitHub 用户名
GITHUB_TOKEN="ghp_hK5zLrE5QvWn3xPj9mB4cD7fG1hJ2kL8nQ0"    # 修改为你的 GitHub Personal Access Token

if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
  echo "使用方法:"
  echo "  1. 编辑此脚本，设置 GITHUB_USER 和 GITHUB_TOKEN"
  echo "  2. 运行: ./push-to-github.sh"
  echo ""
  echo "获取 GitHub Token:"
  echo "  https://github.com/settings/tokens"
  echo "  需要权限: repo"
  exit 0
fi

if [ "$GITHUB_USER" == "clawdai" ] || [ "$GITHUB_TOKEN" == "ghp_hK5zLrE5QvWn3xPj9mB4cD7fG1hJ2kL8nQ0" ]; then
  echo "❌ 请先编辑此脚本设置 GITHUB_USER 和 GITHUB_TOKEN"
  exit 1
fi

echo "🚀 开始推送到 GitHub..."

# 检查并创建远程仓库
echo "📦 检查远程仓库..."
REPO_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_USER/$REPO_NAME")

if [ "$REPO_EXISTS" == "404" ]; then
  echo "📁 创建新仓库: $REPO_NAME"
  curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/user/repos" \
    -d "{\"name\":\"$REPO_NAME\",\"description\":\"Claude Code / Cline 源码拆解分析\",\"private\":false}"
  echo "✅ 仓库创建成功"
else
  echo "✅ 仓库已存在"
fi

# 添加远程仓库
echo "🔗 配置远程仓库..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"

# 推送代码
echo "📤 推送到 GitHub..."
git push -u origin master || git push -u origin main

echo ""
echo "✅ 推送完成!"
echo "📍 仓库地址: https://github.com/$GITHUB_USER/$REPO_NAME"
