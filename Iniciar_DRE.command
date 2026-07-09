#!/bin/bash
# Fechar o terminal caso o usuário encerre o processo
trap "exit" INT TERM

echo "============================================="
echo "   INICIANDO DRE INTELIGENTE (TELECOM/ISP)   "
echo "============================================="
echo ""

# Navegar até a pasta do projeto
cd "/Users/edisoncarlos/Documents/Antigravity"

# Abrir o navegador no endereço local automaticamente
echo "[1/2] Abrindo navegador em http://localhost:5173..."
open "http://localhost:5173"

# Iniciar o servidor de desenvolvimento
echo "[2/2] Iniciando servidor local (Vite)..."
echo "Pressione Ctrl + C neste terminal para desligar."
echo ""
npm run dev
