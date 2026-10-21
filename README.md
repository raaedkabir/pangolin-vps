# Pangolin VPS

This CDK app creates the DNS records and the Amazon SES setup for [Pangolin](https://github.com/fosrl/pangolin), which runs on a RackNerd VPS so the TrueNAS home server can be reached at `*.homelab.raaedkabir.com` without opening any ports at home.

Newt runs on TrueNAS and connects to Pangolin through a WireGuard tunnel, and Pangolin proxies requests back through that tunnel.

## What the stack deploys

- Route 53 hosted zone for `homelab.raaedkabir.com`. The `raaedkabir.com` zone delegates to it, and its `homelab` and `*.homelab` A records point to the VPS IP address (`vpsIp` in `bin/pangolin-vps.ts`)
- SES domain identity for `homelab.raaedkabir.com`, so that Pangolin can send email from that domain. Its DKIM records and a DMARC record are in the hosted zone

## What the bootstrap script does

`scripts/bootstrap.sh` prepares a new Ubuntu 24.04 VPS:

- The installed packages are up to date, and packages that are no longer needed are removed
- The ufw firewall allows SSH (22/tcp), HTTP/HTTPS (80, 443/tcp), WireGuard for sites (51820/udp) and clients (21820/udp), and ping. The script shows the firewall status when it is done
- The latest Pangolin installer in `/root/installer`

## Deployment steps

1. Order the 2GB KVM VPS from the [RackNerd specials](https://www.racknerd.com/specials). Choose the closest location and Ubuntu 24.04. The welcome email has the IP address and the root password.

2. Set `vpsIp` in `bin/pangolin-vps.ts` to the IP address and deploy the stack:

   ```zsh
   npm install
   npx cdk deploy
   ```

   Do this before you run the installer, so the DNS records are live when Pangolin requests its Let's Encrypt certificate.

   If the output has `CreateSmtpUser`, the `pangolin-smtp` IAM user that Pangolin sends email with does not exist. Create it in the SES console as the output says, and keep its SMTP username and password for step 5. Then run `npx cdk context --clear`, so that the next deploy finds the user.

3. Generate the SSH key pair and copy the public key to the VPS. When `ssh-copy-id` asks for a password, enter the root password from the welcome email:

   ```zsh
   ssh-keygen -t ed25519 -f ./pangolin-vps-key
   chmod 400 pangolin-vps-key
   ssh-copy-id -i pangolin-vps-key.pub root@<vps-ip>
   ```

4. Copy the bootstrap script to the VPS and run it:

   ```zsh
   scp -i pangolin-vps-key scripts/bootstrap.sh root@<vps-ip>:/root/
   ssh -i pangolin-vps-key root@<vps-ip> bash bootstrap.sh
   ```

5. SSH in and run the installer:

   ```zsh
   ssh -i pangolin-vps-key root@<vps-ip>
   ./installer
   ```

   - Installation directory: `/opt/pangolin`. Create it: yes
   - Enterprise version: yes. It is free for personal use
   - PostgreSQL: no
   - Base domain: `homelab.raaedkabir.com`
   - Dashboard domain: `pangolin.homelab.raaedkabir.com` (the default)
   - Email for Let's Encrypt certificates: your email address
   - Gerbil for tunneled connections: yes
   - Email functionality (SMTP): yes
     - SMTP host: `email-smtp.ca-central-1.amazonaws.com` (Amazon SES)
     - SMTP port: `587` (the default)
     - SMTP username and password: the SMTP credentials of the `pangolin-smtp` IAM user (step 2)
     - No-reply email address: `no-reply@homelab.raaedkabir.com`. SES sends only from verified domains and addresses, and the stack verifies `homelab.raaedkabir.com`
   - Server is IPv6 capable: no. The DNS records are IPv4 only
   - MaxMind GeoLite2 databases: yes
   - Install and start the containers: yes, with Docker
   - Install Docker: yes

   If `./installer` is missing, run `curl -fsSL https://static.pangolin.net/get-installer.sh | bash`.

6. Open `https://pangolin.homelab.raaedkabir.com/auth/initial-setup` and create the admin account with the setup token from the installer output (also in `docker compose logs pangolin`, run in `/opt/pangolin`). The Let's Encrypt certificate can take a few minutes to be issued.

7. In the dashboard, create a Newt site and run Newt on TrueNAS as a custom app using the Docker Compose snippet the dashboard shows. Then add a resource for each TrueNAS service that you want to expose.

## Notes

- Docker opens the ports that it publishes, even if ufw blocks them. To see the ports that Pangolin publishes, run `docker port gerbil`.
- The installer puts Pangolin in `/opt/pangolin`. Its data is in `/opt/pangolin/config` and `/opt/pangolin/docker-compose.yml`. Back them up (for example, to TrueNAS) so that you can restore them on a new VPS.
- `npx cdk destroy` deletes the hosted zone, its DNS records, and the SES identity. It does not change the VPS or the `pangolin-smtp` IAM user.
