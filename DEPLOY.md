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
npm run build:css
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

O codigo vai pelo GitHub: a VPS faz `git pull` do que voce enviou.

```bash
git add ... && git commit -m "..."
git push
./scripts/deploy.sh
```

O script recusa se houver mudancas nao commitadas ou sem push. Na VPS ele faz pull,
`npm ci` (so se as dependencias mudaram), compila o CSS, reinicia e testa se o site respondeu.
Se falhar, mostra o comando para voltar a versao anterior.

### Como a VPS esta organizada

| Item | Onde |
|------|------|
| App | `/home/jarvis/JARVIS` (usuario `jarvis`, **sem root/sudo**) |
| Segredos e dados | `.env` e `jarvis.db` nessa pasta (fora do git) |
| Arquivos acessiveis pelo JARVIS | `/home/jarvis/jarvis-files` (`TOOLS_MODE=safe`) |
| Processo | PM2 do usuario `jarvis`, servico `pm2-jarvis` (sobe no boot) |
| Acesso ao GitHub | deploy key somente leitura em `~jarvis/.ssh/github_deploy` |
| Nginx | `/etc/nginx/sites-available/jarvis` (precisa de `X-Forwarded-Proto` e `proxy_buffering off`) |

Comandos PM2 rodam como o usuario jarvis: `ssh jarvis@SEU_IP 'pm2 logs jarvis'`.

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
