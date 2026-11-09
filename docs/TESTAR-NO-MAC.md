# Testar no Mac, Android, iPhone e iPad

O Mac executa a API, os modelos e o console. Um Cloudflare Quick Tunnel fornece
um endereço HTTPS temporário. Nenhum domínio nem conta Cloudflare é necessário.
O link e o processamento dependem do Mac ligado, com Internet e Terminal aberto.

## Primeira instalação

Instale o [Homebrew](https://brew.sh), caso ainda não tenha. Abra o Terminal no Mac:

```sh
git clone https://github.com/Ojosuca/Verifica.AI.git
cd Verifica.AI
bash scripts/setup-mac.sh
bash scripts/start-mac.sh
```

Se já clonou o projeto, entre na pasta existente e use `git pull --ff-only` antes
dos comandos de instalação/inicialização. O instalador usa Python 3.12, cria
`.venv`, instala dependências e `cloudflared` e baixa os modelos com hashes
verificados. Não precisa de Node, Docker nem GPU para executar o sistema.

## Nos aparelhos

1. Localize no Terminal a URL `https://....trycloudflare.com`.
2. Abra essa URL diretamente no Chrome do Android ou Safari do iPhone/iPad.
   Evite o navegador interno de mensageiros. Não use a URL HTTP com o IP do Mac:
   ela não habilita a câmera nos aparelhos.
3. Em **Configurações**, informe a mesma URL HTTPS como URL da API e cole a
   chave administrativa mostrada no Terminal. Use apenas em seus dispositivos
   de teste: essa chave permite administrar todos os cadastros. Não a envie no chat.
4. Em **Identidades**, cadastre uma referência JPEG/PNG com um identificador novo,
   como `teste_001`. No iPhone/iPad, fotos HEIC precisam ser exportadas para JPEG.
5. Em **Verificação 1:1**, use o mesmo identificador, marque o consentimento,
   crie uma sessão, permita a câmera e siga o desafio durante a gravação.
6. Repita a conexão em cada aparelho. As credenciais ficam na memória da aba;
   recarregar a página exige conectar novamente.

Os exemplos `colab_001` etc. são sintéticos e não equivalem a referências
cadastradas na API. O resultado positivo experimental é `review_required`:
não aprova ponto automaticamente. Ainda é necessário validar a captura real
em Android e iOS; os testes de servidor não comprovam compatibilidade da câmera.

## Parar, reiniciar e guardar os dados

- Para encerrar, pressione **Ctrl+C** no Terminal. Para voltar, execute
  `bash scripts/start-mac.sh`. Não precisa repetir a instalação a cada teste.
- O link muda quando o túnel é recriado. Use o novo endereço nos aparelhos.
- O início usa `caffeinate` para impedir suspensão por inatividade enquanto o
  processo estiver ativo. Fechar a tampa ou perder a Internet interrompe o acesso.
- Cadastros, eventos e chaves ficam em `.local/`, ignorada pelo Git. Faça backup
  dessa pasta com os serviços parados. A chave de criptografia deve acompanhar o
  banco; sem ela, as referências existentes não podem ser recuperadas.
- Se já tinha um banco na raiz do projeto, ele não é migrado automaticamente:
  este iniciador usa um banco separado em `.local/`.
- O túnel disponibiliza o console e a API na Internet; as operações de dados
  continuam exigindo a chave. O serviço de visão fica acessível apenas no Mac.
- Este ambiente em nuvem não instala nem inicia nada no seu Mac. Os comandos
  acima precisam ser executados no Terminal do Mac.

Referências: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/),
[Python no Homebrew](https://formulae.brew.sh/formula/python@3.12),
[cloudflared no Homebrew](https://formulae.brew.sh/formula/cloudflared).
