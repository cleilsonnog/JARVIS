# Deploy JARVIS na VPS

## 1. Preparar a VPS

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2 (gerenciador de processos)
sudo npm install -g pm2

# Instalar Nginx
sudo apt install -y nginx
```

## 2. Enviar o projeto

```bash
# No seu PC local
scp -r ~/Documentos/JARVIS usuario@SEU_IP:/home/usuario/

# Ou com git
# git clone SEU_REPO /home/usuario/JARVIS
```

## 3. Configurar o projeto

```bash
cd /home/usuario/JARVIS
npm install --production

# Criar .env
cat > .env << EOF
GEMINI_API_KEY=sua_chave_gemini
JARVIS_PASSWORD=sua_senha_segura
PORT=3000
NODE_ENV=production
EOF
```

## 4. Iniciar com PM2

```bash
pm2 start server.js --name jarvis
pm2 save
pm2 startup  # Seguir instrucoes para auto-start no boot
```

## 5. Configurar Nginx (proxy reverso + SSL)

```bash
sudo nano /etc/nginx/sites-available/jarvis
```

Conteudo:
```nginx
server {
    listen 80;
    server_name seu.dominio.com;  # ou IP da VPS

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # Para streaming SSE
        proxy_buffering off;      # Entrega a resposta em tempo real (SSE)
        proxy_cache off;
    }

    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 6. SSL com Let's Encrypt (recomendado)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu.dominio.com
```

O SSL e necessario para:
- PWA funcionar no celular (requer HTTPS)
- Microfone funcionar (Web Speech API requer HTTPS)
- Cookies seguros

## 7. Acessar pelo celular

1. Abra `https://seu.dominio.com` no navegador do celular
2. Digite a senha configurada em `JARVIS_PASSWORD`
3. No Chrome: menu > "Adicionar a tela inicial" (instala como PWA)
4. No Safari: botao compartilhar > "Adicionar a Tela de Inicio"

## Atualizar (deploy de novas versoes)

Do PC local, envia so o codigo (nao mexe em `.env`, banco nem `node_modules`):

```bash
cd ~/Documentos/JARVIS
# Backup na VPS antes
ssh root@SEU_IP 'tar czf /root/jarvis-backup-$(date +%Y%m%d-%H%M).tgz --exclude=node_modules -C /root JARVIS'
# Envio
rsync -rc --itemize-changes --exclude=.env --exclude='jarvis.db*' --exclude=node_modules \
  --exclude=server.log --exclude=.claude --exclude=package-lock.json --exclude=.gitignore \
  ./ root@SEU_IP:/root/JARVIS/
# Se o package.json mudou: ssh root@SEU_IP 'cd /root/JARVIS && npm install --production'
ssh root@SEU_IP 'pm2 restart jarvis'
```

Obs.: as sessoes de login ficam em memoria, entao cada restart pede login de novo.
No celular, recarregue a pagina para o service worker pegar a versao nova.

## Comandos uteis PM2

```bash
pm2 status           # Ver status
pm2 logs jarvis      # Ver logs
pm2 restart jarvis   # Reiniciar
pm2 stop jarvis      # Parar
pm2 monit            # Monitor ao vivo
```

## Firewall

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```

## Sem dominio?

Se nao tem dominio, use o IP diretamente. Mas sem HTTPS:
- O microfone NAO funcionara (exige HTTPS)
- A PWA NAO instalara (exige HTTPS)
- Use um servico como [nip.io](https://nip.io) ou [DuckDNS](https://duckdns.org) para dominio gratuito
