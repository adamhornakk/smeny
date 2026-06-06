# 🚗 Správa Směn (Shift Management PWA)

A responsive Progressive Web Application (PWA) built with **Node.js (Express)**, **React (Vite)**, and **Vanilla CSS** to coordinate driver shifts and company car bookings in real-time.

---

## 🛠️ Server Deployment & Installation Guide

To make the app accessible from anywhere on mobile phones (including standard PWA installation), it should be hosted on a Linux server (e.g., Ubuntu) and secured with HTTPS.

### 📋 Prerequisites
Make sure your server has the following installed:
* **Node.js** (v18 or v22+ recommended)
* **npm** (comes packaged with Node.js)
* **Nginx** (acting as a reverse proxy with SSL certificate)

---

### 🚀 Step 1: Install & Build on Server

1. **Upload files**: Copy the project codebase directory onto your server (e.g., to `/var/www/smeny`).
2. **Install all dependencies**:
   ```bash
   cd /var/www/smeny
   npm install --legacy-peer-deps
   ```
3. **Configure Environment Variables**:
   Copy the example environment file and edit it to set a secure `JWT_SECRET`:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Make sure to generate a strong random secret (e.g., using `openssl rand -hex 32`) for `JWT_SECRET`.
4. **Build the production assets**:
   Compile the Vite React frontend into the optimized static `/dist` directory that the Express server will host:
   ```bash
   npm run build
   ```

---

### 🔄 Step 2: Configure Process Manager (PM2)

In production, you want the application to run continuously in the background and restart automatically if the server reboots or crashes.

1. **Install PM2 globally**:
   ```bash
   sudo npm install -g pm2
   ```
2. **Start the application**:
   ```bash
   pm2 start server.js --name "smeny-app"
   ```
3. **Set up auto-start on system boot**:
   ```bash
   pm2 startup
   ```
   *(Copy and run the command printed by PM2 on your terminal to configure systemd)*
4. **Save current running list**:
   ```bash
   pm2 save
   ```

---

### 🌐 Step 3: Configure Nginx & SSL (HTTPS)

> [!IMPORTANT]
> **PWAs require HTTPS**: Browsers will **not** allow users to install the app or register the Service Worker (required for offline operation) unless the site is secured with an SSL/TLS certificate (HTTPS), except when testing on `localhost`.

#### 1. Setup Nginx Reverse Proxy
Create a new Nginx block configuration (e.g., `/etc/nginx/sites-available/smeny`):

```nginx
server {
    listen 80;
    server_name smeny.yourdomain.com; # Replace with your actual domain

    location / {
        proxy_pass http://localhost:5050; # Port where server.js runs
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE (Server-Sent Events) configuration:
        # Crucial for real-time dashboard updates without delay
        proxy_set_header Connection '';
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/smeny /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 2. Install SSL Certificate (Let's Encrypt)
Use Certbot to automatically fetch and configure a free SSL certificate:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d smeny.yourdomain.com
```
Choose the option to **Redirect HTTP traffic to HTTPS**.

---

### 💾 Step 4: Persistent Data
* The application saves data locally in `db.json`. 
* Make sure the Node process has read/write permissions for `/var/www/smeny/db.json`.
* For backups, simply save a copy of the `db.json` file.
