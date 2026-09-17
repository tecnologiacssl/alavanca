# Alavanca · Simulador de alavancagem

Site estático (HTML + CSS + JavaScript puro). Não precisa de servidor, banco de dados nem instalação.

## Arquivos
- `index.html` – estrutura das telas (login, início, detalhe do desafio)
- `style.css` – visual, cores dos cards, modo claro/escuro
- `script.js` – login local, cálculos, registro de green/red e salvamento

## Testar no computador
Dê dois cliques no `index.html`. Ele abre no navegador e já funciona.

## Publicar

**Netlify (mais rápido):** acesse https://app.netlify.com/drop e arraste a pasta `alavanca`. O site fica no ar em segundos, com um link `.netlify.app`.

**Vercel:** em https://vercel.com crie um projeto novo, envie a pasta (ou conecte um repositório do GitHub) e clique em Deploy. Não há comando de build.

**GitHub Pages:** crie um repositório, envie os 3 arquivos, vá em Settings → Pages, escolha a branch `main` e a pasta `/root`.

**Hospedagem comum (Hostinger, HostGator, Locaweb etc.):** envie os 3 arquivos para a pasta `public_html` pelo gerenciador de arquivos ou FTP.

## Observações
- Os dados (contas e desafios) ficam salvos no navegador de cada pessoa (localStorage). Trocar de navegador ou limpar os dados do site apaga o progresso.
- O login é local: protege a tela e separa os dados por conta no mesmo navegador, mas não é autenticação de servidor. Para login real e dados na nuvem, é possível integrar com Supabase Auth.
- Simulação 100% manual: o site não se conecta a nenhuma casa de apostas.
