# Verifica.ai · Identidade

Primeira implementação de uma plataforma de validação facial 1:1 com console web administrativo, API Python e serviço próprio experimental de ações e objetos. O primeiro caso de uso é apoiar validação de colaboradores para ponto; os endpoints também podem ser usados em autenticação e controle de acesso.

**O console hospedado usa dados sintéticos. A API e os modelos Python são executados separadamente. O serviço próprio de liveness ainda não é um PAD validado: uma correspondência retorna `review_required`, nunca `approved`. Não há integração de folha/ponto nem cálculo de horas nesta versão.**

## Escolha da linguagem

| Opção | Avaliação para este projeto |
| --- | --- |
| Python + FastAPI | Escolha inicial. Melhor acesso ao ecossistema de visão, treinamento, OpenCV e ONNX. Inferência roda em bibliotecas nativas; concorrência deve ser limitada. |
| Go | Excelente gateway e concorrência; mais trabalho na integração de modelos e pré-processamento. Considerar depois de medir gargalos. |
| Rust | Controle de memória e boa latência; maior custo inicial. Indicado para um agente local ou partes críticas já identificadas. |
| C# | Excelente com ASP.NET Core e ONNX Runtime, sobretudo para uma equipe .NET. Menos ferramentas prontas para pesquisa de visão. |

## Executar localmente

Para testar no **Mac, Android, iPhone e iPad**, siga o
[guia de instalação com link HTTPS](docs/TESTAR-NO-MAC.md).
O iniciador configura os dois serviços e mantém as chaves e o banco em `.local/`.

Python 3.12 recomendado. Em Linux/macOS:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m backend.download_models --objects
export VERIFICA_ADMIN_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export VERIFICA_TEMPLATE_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export VERIFICA_PAD_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export VERIFICA_PAD_URL=http://127.0.0.1:8001/api/v1/analyze
export VERIFICA_ALLOWED_ORIGINS=https://verifica-ai-console.josue-mendes7544.chatgpt.site
uvicorn backend.liveness:app --host 127.0.0.1 --port 8001 &
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Use `http://localhost:8000` para o console e `http://localhost:8000/docs` para Swagger. Em Configurações informe URL e a chave administrativa gerada. As variáveis exportadas precisam existir nos dois processos; o `.env.example` é documentação, não é lido automaticamente. Guarde a chave Fernet: perder ou trocar essa chave torna os templates existentes ilegíveis. Não use chaves de exemplo em ambientes reais.

O console remoto exige uma URL HTTPS acessível ao navegador e origem CORS explícita. O backend não foi implantado em um servidor público. Não cole credenciais em chats nem envie chave administrativa para um aplicativo de usuários finais. Este console é para um operador autorizado; login multiusuário/RBAC ainda não foi implementado.

## Fluxo de validação

1. Cadastre uma referência consentida com `POST /api/v1/subjects` (`subject_id`, `consent`, `reference` JPEG/PNG em multipart).
2. Crie uma sessão com `POST /api/v1/sessions` (`subject_id`, `consent` em JSON).
3. Oriente a pessoa pelo desafio retornado: centro e dois movimentos aleatórios de cabeça.
4. Envie `nonce` e `video` em multipart para `POST /api/v1/sessions/{session_id}/verify`. A sessão é de uso único e expira em 120 segundos.
5. Trate `review_required`, `liveness_failed` e `face_mismatch`. **Não transforme `review_required` em presença confirmada.**

A referência é responsabilidade do operador; não há verificação de documento civil nem prova de vida no cadastro. Não se realiza busca 1:N. Templates são criptografados por Fernet e os vídeos temporários são removidos ao final do processamento. Eventos não contêm fotos nem embeddings, mas possuem identificador e devem seguir política de retenção da organização.

## Serviço próprio de liveness e visão

`backend/liveness.py` oferece `POST /api/v1/analyze` com autenticação entre serviços. YuNet detecta rosto e marcos. A posição relativa do nariz aos olhos classifica centro/esquerda/direita. São exigidas duas amostras consecutivas por ação e a ordem do desafio. Isso detecta uma sequência de ações; **não demonstra resistência a replay, deepfake, máscaras ou apresentação em telas**. Não se detectam piscadas.

MobileNet SSD é opcional e identifica 20 classes VOC, incluindo pessoa, cadeira, garrafa e monitor. Não detecta todas as categorias possíveis, como celulares. Objetos são contexto e não são usados como garantia de liveness. O score de liveness é a fração de ações completadas, não uma probabilidade de pessoa viva. O serviço retorna `validated=false` de forma fixa, e a API exige revisão quando a comparação passa.

O resultado é ligado a `session_id`, `nonce` e SHA-256 do vídeo, assinado por HMAC com o segredo entre serviços. Esse vínculo protege integridade da resposta, mas não impede vídeo manipulado no cliente. Para evoluir: dados próprios consentidos com ataques, modelos temporais ant spoofing, avaliação de generalização, injeção de câmera e auditoria de métricas APCER/BPCER em diferentes dispositivos e grupos. Só após validação independente deve-se implementar um modo de aprovação automática.

## Otimização implementada e limites

- Upload binário até 8 MiB; clipes de 1 a 8 segundos, sem áudio na captura web.
- Modelos carregados uma vez por processo, redução para 960px na comparação e 640px nas ações.
- Oito quadros na comparação, até 32 nas ações; detecção de objetos em até quatro amostras.
- Inferência sai do event loop, concorrência limitada e lock protege os objetos OpenCV. SQLite em WAL serve como base local.
- Sessões de uso único consumidas atomicamente; expiração e vínculo de nonce; falhas do serviço não aprovam a pessoa.

Antes de produção: limite de corpo e taxa no proxy **antes do parser multipart** (incluindo transferências chunked), limite de filas/tempo de CPU, isolamento de decodificador em processo/container com teto de memória, PostgreSQL/Redis para múltiplas instâncias, autenticação por usuário, RBAC, rotação de chaves, retenção e exclusão programadas, telemetria, auditoria e avaliação LGPD. O serviço de visão deve ficar em rede privada, com TLS ou mTLS fora de localhost. Os semáforos atuais limitam processamento, não toda a memória de requisições em espera.

O limiar SFace `0.363` é apenas um ponto de partida do modelo e requer calibração para o caso de uso; não há garantia de acurácia, equidade, latência nem homologação de sistema de ponto/REP. Um sistema de horas precisa ainda de eventos de entrada/saída, políticas de jornada, justificativas, auditoria e revisão das regras aplicáveis.

## Testes

```sh
python -m pytest -q
```

Testes automatizados cobrem contratos, consentimento, autenticação, criptografia, exclusão, nonce, expiração, uso único, respostas assinadas, limites e bloqueio de aprovação automática experimental. Usam motores controlados e não medem qualidade biométrica nem resistência a ataques. Validação com câmeras e pessoas reais é uma etapa separada.

Os 14 testes Python incluem decodificação sequencial de vídeo sem depender dos metadados de duração, ausentes em algumas capturas WebM de navegador. Quatro testes de estado da interface usam DOM simulado com JSDOM:

```sh
npm install
npm run test:ui
```

Cobrem origem sintética/real de exportação, invalidação de sessão após edição, resposta atrasada após navegação e troca de backend sem herdar referências reais. Eles não substituem testes visuais ou com câmera. A publicação do console foi confirmada; a inspeção visual desktop/mobile foi bloqueada nesta sessão por falhas do relay e do controle de navegador.

## Modelos e licenças

Downloads de [OpenCV Zoo](https://github.com/opencv/opencv_zoo) (YuNet e SFace) e [MobileNet-SSD](https://github.com/chuanqi305/MobileNet-SSD). O instalador verifica SHA-256 fixado no código e imprime o hash de cada artefato. Mudanças upstream com hash divergente são recusadas. Revise as licenças de código, pesos e dados de treino e fixe hashes/versões antes do uso comercial. O modelo de reconhecimento não é treinado neste projeto. A lógica do serviço de desafios e objetos é própria, construída sobre detectores existentes.
