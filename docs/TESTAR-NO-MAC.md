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
4. Em **Identidades**, use **Cadastrar rosto**. Escolha uma foto JPEG/PNG ou use
   a opção de tirar foto no celular/tablet. Confira a prévia e informe um
   identificador novo, como `teste_001`. Fotos HEIC precisam ser exportadas para
   JPEG. A interface reduz fotos grandes para no máximo 1.600 pixels no maior lado.
5. Toque em **Cadastrar e verificar**. O rosto será selecionado na tela seguinte.
   Marque a autorização da captura e toque em **Gravar e verificar**: o console
   abre a câmera, prepara a sessão, faz uma contagem de 2 segundos e grava
   7,2 segundos com instruções sequenciais de 2,4 segundos por movimento.
   Não é obrigatório preparar uma sessão separadamente. Bloqueios da câmera e
   erros da API aparecem na própria tela e permitem tentar novamente.
6. Repita a conexão em cada aparelho. As credenciais ficam na memória da aba;
   recarregar a página exige conectar novamente.

Os exemplos `colab_001` etc. são sintéticos e não equivalem a referências
cadastradas na API. O resultado positivo experimental é `review_required`:
não aprova ponto automaticamente. Ainda é necessário validar a captura real
em Android e iOS; os testes de servidor não comprovam compatibilidade da câmera.

As telas de Identidades e Verificação consultam os cadastros na API; por isso,
outros aparelhos conectados ao mesmo Mac podem selecionar a mesma referência.
Use **Atualizar lista** para buscar cadastros feitos em outro aparelho após a conexão.
O nome de exibição passa a ser salvo junto ao identificador. Cadastros antigos
continuam válidos e aparecem pelo identificador quando não possuem nome salvo.

### Guia animada e malha facial

Ao ativar a câmera, aguarde o carregamento dos pontos faciais. A seta e o desenho
mostram a **sua esquerda** ou a **sua direita**, seguindo a ordem do desafio. Vire
levemente, sem chegar a um perfil completo, e mantenha os olhos visíveis. A barra
mostra o tempo do movimento; ela não comprova que ele passou na análise da API.

A malha acompanha até 478 pontos detectados na prévia espelhada. A vista
**3D estimado** usa a profundidade inferida pelo modelo a partir da imagem da
câmera; não é uma medição por sensor 3D nem uma validação ant fraude. Pontos e
geometria não são salvos nem enviados por esse rastreador. O vídeo de verificação
continua sendo enviado ao Mac para a comparação e análise do desafio.

Os recursos ficam em `dist/face/` (aproximadamente 26 MB, incluindo variantes do
runtime). A primeira abertura pode demorar. Não precisa instalar Node nem baixar
um modelo adicional manualmente: `git pull --ff-only` já inclui esses arquivos.
Se o aparelho não conseguir iniciar o rastreador, aparece uma mensagem e a guia
animada continua disponível, sem exibir pontos fictícios. Os pontos são removidos
quando a imagem para de atualizar, a aba fica oculta ou você sai da tela.

A preferência de movimento reduzido do aparelho mantém as setas e instruções
visíveis e remove a rotação repetida do desenho. A velocidade de rastreamento
depende do aparelho; ainda é necessário testar em seu Android/iPhone/iPad.

## Atualizar uma instalação existente

Encerre os serviços com Ctrl+C e, dentro da pasta do projeto, execute:

```sh
git pull --ff-only
bash scripts/start-mac.sh
```

Abra o novo link HTTPS e recarregue a página nos aparelhos para carregar o JavaScript
atualizado. Conecte a API novamente. A atualização acrescenta o campo de nome ao
banco existente automaticamente; preserva os templates, cadastros e chaves.

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
