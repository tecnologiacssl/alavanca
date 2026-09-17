# Alavanca 📈

**Simulador manual de alavancagem e gestão de banca para apostas esportivas.**

> 🚀 **Em breve online em [dominio.com](https://dominio.com)**
> O site está em fase final e será publicado nesse endereço nos próximos dias.

---

## Sobre o projeto

O Alavanca é um site que mostra, em números, como funciona a alavancagem de banca com juros compostos. Com ele, quem já aposta consegue planejar um desafio, registrar cada resultado manualmente e enxergar o risco antes de colocar dinheiro de verdade.

**O Alavanca não incentiva apostas.** O site não é uma casa de apostas, não processa apostas nem pagamentos e não tem parceria ou patrocínio de nenhuma empresa do setor. O objetivo é ajudar quem já aposta a ter disciplina, controlar a banca e diminuir o dinheiro que as bets tiram de quem perdeu o controle.

🔞 **Proibido para menores de 18 anos.**

## Funcionalidades

- **Login e cadastro**: tela minimalista, com confirmação obrigatória de maioridade no cadastro.
- **Desafios prontos**: cada card tem uma cor própria e pode ter banca e odd ajustadas antes de começar.

  | Desafio | Duração | Odd sugerida |
  |---|---|---|
  | 🟧 Sprint | 15 dias | 1,50 |
  | 🟪 Clássico | 1 mês | 1,30 |
  | 🟩 Constância | 3 meses | 1,10 |
  | 🟥 Longo prazo | 5 meses | 1,05 |
  | 🟦 Personalizado | até 365 dias | livre |

- **Cronograma automático**: a tabela é calculada dia a dia com a aposta, o retorno potencial, a banca acumulada e a chance estimada de chegar até aquele dia.
- **Acompanhamento diário**: cada desafio mostra só o dia atual, com três ações.
  - **Ganhei (Green)**: avança para o próximo dia.
  - **Perdi (Red)**: zera a banca e encerra o desafio.
  - **Parar e resgatar lucro**: encerra o desafio e mostra o lucro realizado.
- **Proteção contra erros**: não é possível registrar um dia já preenchido ou um dia futuro. Ações críticas pedem confirmação.
- **Vários desafios ao mesmo tempo**, com um painel que mostra a banca em jogo e o lucro já resgatado.
- **Histórico** dos desafios encerrados, com cores por resultado: verde para concluído ou resgatado, vermelho para red e amarelo para encerrado.
- **Rodapé de jogo responsável**, que reúne:
  - o aviso de 18+;
  - dicas para apostar com sabedoria;
  - canais de ajuda: autoexclusão pelo gov.br, CAPS/UBS, CVV 188 e Jogadores Anônimos;
  - as casas mais acessadas do Brasil, listadas apenas como referência de mercado.
- **Modo claro e escuro**, que segue a preferência do sistema.
- **Layout responsivo** para celular, tablet e computador.

## Como funciona o cálculo

O modelo é *all-in*: 100% da banca do dia anterior é apostada no dia seguinte.

```
Aposta (dia n)  = Banca acumulada (dia n-1)
Retorno (dia n) = Aposta (dia n) × Odd fixa
Banca (dia n)   = Retorno (dia n)
```

Exemplo: R$ 5,00 com odd 1,50 por 15 dias chega a **R$ 2.190,36**, mas só se as 15 apostas derem green.

⚠️ **Um único red zera toda a banca.** A coluna "Chance" mostra a probabilidade de acertar todas as apostas até aquele dia, considerando a odd justa (1 ÷ odd). Como as casas embutem margem nas odds, a chance real é ainda menor.

## Tecnologias

- HTML5, CSS3 e JavaScript puro, sem frameworks e sem etapa de build.
- Fontes Bricolage Grotesque e Figtree (Google Fonts).
- Dados salvos no `localStorage` do navegador.
- Senhas armazenadas com hash SHA-256 e salt (Web Crypto API).

## Estrutura

```
alavanca/
├── index.html   # telas: login, painel, detalhe do desafio e rodapé
├── style.css    # visual, cores dos cards, modo claro/escuro
├── script.js    # login, cálculos, registro de resultados e salvamento
└── README.md
```

## Rodando localmente

Não precisa instalar nada. Abra o `index.html` no navegador.

Se preferir usar um servidor local:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## Publicação

O site será publicado em **[dominio.com](https://dominio.com)**. Por ser estático, funciona em qualquer uma destas opções:

- **Netlify**: arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop).
- **Vercel**: crie um novo projeto e faça o deploy, sem comando de build.
- **GitHub Pages**: em *Settings → Pages*, selecione a branch `main`.
- **Hospedagem tradicional** (Hostinger, HostGator, Locaweb etc.): envie os arquivos para a pasta `public_html`.

Para usar o domínio próprio, aponte o DNS de `dominio.com` para a hospedagem escolhida, seguindo as instruções do painel dela.

## Limitações atuais

- O login é local. Ele separa os dados por conta no mesmo navegador, mas não substitui uma autenticação com servidor.
- Os dados ficam só no navegador. Trocar de aparelho ou limpar os dados do site apaga o progresso.

## Próximos passos

- [ ] Publicar em dominio.com
- [ ] Login real e dados na nuvem (Supabase)
- [ ] Modo "gestão de banca", com aposta de uma porcentagem da banca e limite diário de perda
- [ ] Exportar o histórico em CSV/PDF

## Precisa de ajuda?

Se as apostas deixaram de ser diversão:

- **Autoexclusão de apostas (gov.br)**: bloqueia seu CPF em todas as casas autorizadas → [gov.br/fazenda › autoexclusão](https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/autoexclusao)
- **CAPS e UBS**: atendimento gratuito pelo SUS
- **CVV**: ligue **188**, 24 horas, ou acesse [cvv.org.br](https://cvv.org.br)
- **Jogadores Anônimos**: [jogadoresanonimos.com.br](https://jogadoresanonimos.com.br)

---

**Aposta não é investimento. Jogue com responsabilidade.** · Proibido para menores de 18 anos.
