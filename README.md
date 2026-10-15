# Pangolin VPS

This CDK app runs [Pangolin](https://github.com/fosrl/pangolin) on EC2 so the TrueNAS home server can be reached at `*.homelab.raaedkabir.com` without opening any ports at home.

Newt runs on TrueNAS and connects to Pangolin through a WireGuard tunnel, and Pangolin proxies requests back through that tunnel.

## What the stack deploys

- `t3.micro` Ubuntu 24.04 instance in the default VPC with a 20GB encrypted disk, 2GB of swap and an Elastic IP
- Security group that allows SSH (22/tcp), HTTP/HTTPS (80, 443/tcp), WireGuard for sites (51820/udp) and clients (21820/udp), and ping
- Route 53 hosted zone for `homelab.raaedkabir.com`. The `raaedkabir.com` zone delegates to it, and its `homelab` and `*.homelab` A records point to the Elastic IP
- The latest Pangolin installer in `/home/ubuntu/installer` downloaded on first boot

## Deployment steps

1. Generate the SSH key pair:

   ```zsh
   ssh-keygen -m PEM -b 4096 -f ./my-key-pair -t rsa
   chmod 400 my-key-pair
   ```

2. Deploy the stack:

   ```zsh
   npm install
   npx cdk deploy
   ```

3. SSH in with the `SSHCommand` stack output and run the installer:

   ```zsh
   ssh -i my-key-pair ubuntu@<elastic-ip>
   sudo ./installer
   ```

   - Base domain: `homelab.raaedkabir.com`
   - Dashboard domain: `pangolin.homelab.raaedkabir.com` (the default)
   - Install Gerbil for tunneling: yes
   - Install Docker if it asks

   If `./installer` is missing, first boot may still be running (check with `cloud-init status --wait`). Otherwise if the installer is still missing, run `curl -fsSL https://static.pangolin.net/get-installer.sh | bash`.

4. Open `https://pangolin.homelab.raaedkabir.com/auth/initial-setup` and create the admin account with the setup token from the installer output (also in `sudo docker compose logs pangolin`). The Let's Encrypt certificate can take a few minutes to be issued.

5. In the dashboard, create a Newt site and run Newt on TrueNAS as a custom app using the Docker Compose snippet the dashboard shows. Then add a resource for each TrueNAS service that you want to expose.

## Notes

- If you change the AMI, key pair, or disk after you deploy, CloudFormation replaces the instance, which wipes the Pangolin install.
- `cdk.context.json` keeps the AMI ID, so a new Ubuntu release does not replace the instance. To use a newer image, run `npx cdk context` to find the key. Run `npx cdk context --reset <key>` and redeploy.
- `npx cdk destroy` deletes all of the stack's resources. This includes the hosted zone, the Elastic IP, and the Pangolin data on the instance.
