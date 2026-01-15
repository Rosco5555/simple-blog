# AWS Hosting Plan for Blog Application

## Your Stack
- **Frontend:** React 19 + TypeScript (static build)
- **Backend:** .NET 10 ASP.NET Core Web API
- **Database:** PostgreSQL 17
- **External:** Resend API (email), S3 (images)

## Cost Summary
| First 12 months | After free tier |
|-----------------|-----------------|
| ~$1/month | ~$25/month |

---

## Architecture

```
Route 53 (DNS)
     |
CloudFront ──> S3 (frontend static files)
     |
     +──> EC2 t3.micro (backend API)
              |
              +── RDS PostgreSQL (database)
              |
              +── S3 (image uploads)
```

---

## Step 1: Create S3 Bucket for Frontend

**Console:** S3 > Create bucket

```
Bucket name: yourblog-frontend-[random-suffix]
Region: us-east-1
Object Ownership: ACLs disabled
Block Public Access: UNCHECK "Block all public access"
  └─ Acknowledge the warning checkbox
```

**Enable static website hosting:**
1. Bucket > Properties > Static website hosting > Edit
2. Enable, Index document: `index.html`, Error document: `index.html`
3. Note the endpoint URL

**Add bucket policy** (Bucket > Permissions > Bucket policy):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::yourblog-frontend-[suffix]/*"
  }]
}
```

---

## Step 2: Create S3 Bucket for Image Uploads

**Console:** S3 > Create bucket

```
Bucket name: yourblog-uploads-[random-suffix]
Region: us-east-1
Block Public Access: UNCHECK for public read
```

**Add bucket policy for public read:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::yourblog-uploads-[suffix]/*"
  }]
}
```

---

## Step 3: Create RDS PostgreSQL Database (FREE TIER)

**Console:** RDS > Create database

```
Engine: PostgreSQL 17
Template: Free tier  <-- IMPORTANT
DB instance identifier: blog-db
Master username: blogadmin
Master password: [generate strong password]
Instance class: db.t3.micro (free tier eligible)
Storage: 20 GB gp2 (free tier)
Public access: No
VPC security group: Create new "blog-db-sg"
Initial database name: blog
```

**After creation, note:**
- Endpoint: `blog-db.xxxxxx.us-east-1.rds.amazonaws.com`
- Port: `5432`

---

## Step 4: Create EC2 Instance (FREE TIER)

**Console:** EC2 > Launch instance

```
Name: blog-api
AMI: Ubuntu Server 24.04 LTS (free tier eligible)
Instance type: t3.micro (free tier eligible)
Key pair: Create new or select existing
Network settings:
  - Allow SSH (port 22)
  - Allow HTTP (port 80)
  - Allow HTTPS (port 443)
Storage: 8 GB gp3 (free tier)
```

**Update security group** to allow access to RDS:
1. Go to EC2 > Security Groups
2. Find the RDS security group (blog-db-sg)
3. Edit inbound rules > Add rule:
   - Type: PostgreSQL
   - Source: EC2 instance's security group

---

## Step 5: Configure EC2 Instance

**SSH into instance:**
```bash
ssh -i your-key.pem ubuntu@[ec2-public-ip]
```

**Install .NET 10:**
```bash
# Add Microsoft package repository
wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt update

# Install ASP.NET Core runtime
sudo apt install -y aspnetcore-runtime-10.0
```

**Install Nginx:**
```bash
sudo apt install -y nginx
```

**Install PostgreSQL client (for migrations):**
```bash
sudo apt install -y postgresql-client
```

---

## Step 6: Run Database Migrations

From EC2 instance:
```bash
# Set connection string
export PGHOST=blog-db.xxxxxx.us-east-1.rds.amazonaws.com
export PGUSER=blogadmin
export PGPASSWORD=your-password
export PGDATABASE=blog

# Copy migration files to EC2 first, then run:
psql < migrations/001_create_blog_posts.sql
psql < migrations/002_add_location.sql
psql < migrations/003_add_users.sql
psql < migrations/004_row_level_security.sql
psql < migrations/005_add_password.sql
psql < migrations/006_admin_user.sql
```

---

## Step 7: Deploy Backend

**On your local machine - publish the app:**
```bash
cd /Users/ross/Documents/blog/Blog.Api
dotnet publish -c Release -o ./publish
```

**Copy to EC2:**
```bash
scp -i your-key.pem -r ./publish/* ubuntu@[ec2-ip]:/home/ubuntu/blog-api/
```

**Create systemd service** on EC2:
```bash
sudo nano /etc/systemd/system/blog-api.service
```

```ini
[Unit]
Description=Blog API
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/blog-api
ExecStart=/usr/bin/dotnet /home/ubuntu/blog-api/Blog.Api.dll
Restart=always
RestartSec=10
User=ubuntu
Environment=ASPNETCORE_URLS=http://localhost:5000
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ConnectionStrings__Blog=Host=blog-db.xxxxxx.us-east-1.rds.amazonaws.com;Database=blog;Username=blogadmin;Password=YOUR_PASSWORD
Environment=Resend__ApiKey=YOUR_RESEND_API_KEY
Environment=Admin__Email=YOUR_ADMIN_EMAIL
Environment=AWS__AccessKey=YOUR_AWS_ACCESS_KEY
Environment=AWS__SecretKey=YOUR_AWS_SECRET_KEY
Environment=AWS__BucketName=yourblog-uploads-suffix
Environment=AWS__Region=us-east-1

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable blog-api
sudo systemctl start blog-api
sudo systemctl status blog-api
```

---

## Step 8: Configure Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/blog-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection keep-alive;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/blog-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 9: Set Up SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Certbot auto-renews via systemd timer.

---

## Step 10: Deploy Frontend

**Update API URL in frontend:**

Edit `frontend/src/App.tsx` - change hardcoded URLs to use your domain:
```typescript
const API_BASE = 'https://api.yourdomain.com';
```

**Build and upload:**
```bash
cd /Users/ross/Documents/blog/frontend
npm run build
aws s3 sync build/ s3://yourblog-frontend-suffix --delete
```

---

## Step 11: Set Up CloudFront (Optional but recommended)

**Console:** CloudFront > Create distribution

```
Origin domain: yourblog-frontend-suffix.s3.us-east-1.amazonaws.com
Origin access: Public
Viewer protocol policy: Redirect HTTP to HTTPS
Cache policy: CachingOptimized
Default root object: index.html
```

**Add custom error response** for React Router:
- Error code: 403 → Response: /index.html, HTTP 200
- Error code: 404 → Response: /index.html, HTTP 200

---

## Step 12: Configure Route 53 (if using custom domain)

**Create hosted zone:**
- Domain name: yourdomain.com

**Add records:**
- `yourdomain.com` → A record → Alias to CloudFront distribution
- `api.yourdomain.com` → A record → EC2 Elastic IP

---

## Code Changes Required

### 1. Update CORS in `Blog.Api/Program.cs`

```csharp
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
            "https://yourdomain.com",
            "https://www.yourdomain.com",
            "http://localhost:3000"  // keep for local dev
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});
```

### 2. Add S3 image upload in `ImagesController.cs`

Install SDK:
```bash
dotnet add package AWSSDK.S3
```

Replace local file storage with S3 upload (code change needed in ImagesController.cs).

### 3. Update frontend API URLs

Replace hardcoded `localhost:5252` with environment variable or production URL.

---

## Verification Checklist

- [ ] S3 frontend bucket accessible via CloudFront URL
- [ ] API responds: `curl https://api.yourdomain.com/api/posts`
- [ ] Database connected: API returns empty array `[]` for posts
- [ ] Auth flow: Request magic link → receive email → click link → redirected and logged in
- [ ] Create post: New post appears in list
- [ ] Image upload: Image displays in post
- [ ] After EC2 reboot: Service auto-starts, data persists

---

## Ongoing Maintenance

**Monthly tasks:**
- Review AWS billing dashboard
- Check CloudWatch for errors
- Update Ubuntu: `sudo apt update && sudo apt upgrade`

**When deploying updates:**
```bash
# Backend
dotnet publish -c Release -o ./publish
scp -r ./publish/* ubuntu@[ec2-ip]:/home/ubuntu/blog-api/
ssh ubuntu@[ec2-ip] "sudo systemctl restart blog-api"

# Frontend
npm run build
aws s3 sync build/ s3://yourblog-frontend-suffix --delete
aws cloudfront create-invalidation --distribution-id XXXX --paths "/*"
```
