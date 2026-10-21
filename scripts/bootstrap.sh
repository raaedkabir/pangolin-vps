#!/usr/bin/env bash
set -euo pipefail

# Update the installed packages
export DEBIAN_FRONTEND=noninteractive
apt update
apt upgrade -y
apt autoremove -y

# Allow only the ports that Pangolin needs
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 51820/udp comment 'Pangolin site tunnels'
ufw allow 21820/udp comment 'Pangolin client tunnels'
ufw --force enable
ufw status verbose

# Download the latest Pangolin installer - https://docs.pangolin.net/self-host/quick-install
cd /root
curl -fsSL https://static.pangolin.net/get-installer.sh | bash
