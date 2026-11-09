const icons={overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',face:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 9v2m8-2v2m-7 5c2 1.5 4 1.5 6 0m-3-7v5h-2"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',settings:'<path d="m9 3-.5 3-2.5 1-2.5-1.2-2 3.4L4 11v2l-2.5 1.8 2 3.4L6 17l2.5 1 .5 3h4l.5-3 2.5-1 2.5 1.2 2-3.4L18 13v-2l2.5-1.8-2-3.4L16 7l-2.5-1-.5-3Z"/><circle cx="11" cy="12" r="3"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',shield:'<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z"/><path d="m8 12 3 3 5-6"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',camera:'<path d="M4 6h4l2-3h4l2 3h4v15H4Z"/><circle cx="12" cy="13" r="4"/>',link:'<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 1 1 6 6l-5 5a4 4 0 0 1-6 0"/>'};
const icon=(name,size=19)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.face}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes={overview:['Visão geral','overview'],verify:['Verificação 1:1','face'],identities:['Identidades','users'],vision:['Visão computacional','activity'],api:['API & documentação','code'],settings:['Configurações','settings']};
const sample=[{id:'vrf_8f2a91',name:'Mariana Costa',subject:'colab_001',status:'approved',date:'Hoje, 14:32:08',ms:842,initials:'MC'},{id:'vrf_7c4b28',name:'Pedro Almeida',subject:'colab_002',status:'approved',date:'Hoje, 14:28:45',ms:916,initials:'PA'},{id:'vrf_6e9d13',name:'Juliana Santos',subject:'colab_003',status:'liveness_failed',date:'Hoje, 14:25:12',ms:1204,initials:'JS'},{id:'vrf_5a1c74',name:'Lucas Ferreira',subject:'colab_004',status:'approved',date:'Hoje, 14:21:56',ms:789,initials:'LF'},{id:'vrf_4b8e02',name:'Camila Oliveira',subject:'colab_005',status:'face_mismatch',date:'Hoje, 14:18:30',ms:1056,initials:'CO'}];
let records=[...sample],identities=sample.map(x=>({id:x.subject,name:x.name,initials:x.initials}));
let base='',token='',connected=false,route='',stream=null,recording=false,endpoint=0,activeSession=null;
let sessionGeneration=0,connectionGeneration=0,cameraGeneration=0,preparing=false;
let selectedSubject='',identityLoadError='',referenceFile=null,referenceError='',referencePending=null,referenceGeneration=0,enrolling=false,identityGeneration=0;
let toastTimer;
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500)}
function goto(r){if(recording)return toast('Aguarde o fim da captura antes de navegar.');location.hash=r;if(route===r)render()}
function title(name,desc,buttons=''){return `<div class="page-title"><div><h1>${name}</h1><p>${desc}</p></div><div class="actions">${buttons}</div></div>`}
function banner(){return `<div class="demo-banner">${icon('shield',15)}<span><strong>${connected?'Backend conectado.':'Ambiente de demonstração.'}</strong> ${connected?'Indicadores e identidades são exemplos; atualize os eventos pela API.':'Dados sintéticos para explorar a plataforma.'}</span><button data-route="settings">${connected?'Ver conexão':'Conectar API'}</button></div>`}
function status(s){let label={approved:'Aprovada',liveness_failed:'Prova de vida falhou',face_mismatch:'Não corresponde',review_required:'Revisão necessária'}[s]||s;return `<span class="status ${s==='approved'?'':s==='review_required'?'pending':'failed'}">${esc(label)}</span>`}
async function request(path,method='GET',body,context={base,token}){
  if(!context.base)throw Error('Conecte a API em Configurações.');
  const opts={method,headers:{Authorization:'Bearer '+context.token}};
  if(body instanceof FormData)opts.body=body;
  else if(body){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);opts.signal=controller.signal;
  let res;try{res=await fetch(context.base+path,opts)}catch(error){throw Error(error.name==='AbortError'?'A API demorou mais de 45 segundos. Confira o Mac e tente novamente.':'Não foi possível acessar a API. Confira a conexão do Mac e o link HTTPS.')}finally{clearTimeout(timeout)}
  if(res.status===204)return {};
  let out;try{out=await res.json()}catch{throw Error('A API não retornou uma resposta válida. Confira se o Mac e o túnel continuam ligados.')}
  if(!res.ok){const detail=Array.isArray(out.detail)?out.detail.map(x=>x.msg).join('; '):out.detail;throw Error(typeof detail==='string'?detail:'A API recusou a solicitação ('+res.status+').')}
  return out;
}
function sameConnection(context){return connected&&context.base===base&&context.token===token}
function referenceItems(){return connected?identities.filter(x=>x.real&&x.backend===base):[]}
async function loadIdentities(context={base,token}){
  const generation=++identityGeneration;
  const out=await request('/api/v1/subjects','GET',undefined,context);
  if(!Array.isArray(out.subjects))throw Error('Atualize a API no Mac para carregar os rostos cadastrados.');
  if(!sameConnection(context)||generation!==identityGeneration)return;
  identities=out.subjects.map(x=>({id:x.subject_id,name:x.display_name||x.subject_id,initials:(x.display_name||x.subject_id).slice(0,2).toUpperCase(),real:true,backend:context.base}));
  identityLoadError=out.has_more?'Exibindo os 1.000 cadastros mais recentes.':'';
  if(!identities.some(x=>x.id===selectedSubject))selectedSubject=identities.length===1?identities[0].id:'';
}
function table(rows=records){return `<div class="table-scroll"><table><thead><tr><th>IDENTIDADE</th><th>VERIFICAÇÃO</th><th>RESULTADO</th><th>DATA E HORA</th><th>TEMPO</th><th></th></tr></thead><tbody id="record-rows">${rowsHTML(rows)}</tbody></table></div>`}
function rowsHTML(rows){return rows.length?rows.map(x=>`<tr><td><div class="person"><span class="avatar">${esc(x.initials)}</span><div><b>${esc(x.name)}</b><small>${esc(x.subject)}</small></div></div></td><td class="mono">${esc(x.id)}</td><td>${status(x.status)}</td><td>${esc(x.date)}</td><td class="mono">${esc(x.ms)} ms</td><td><button class="row-detail" data-detail="${esc(x.id)}" aria-label="Ver detalhes de ${esc(x.name)}">${icon('arrow',14)}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Nenhuma verificação encontrada.</td></tr>'}
function chart(days=7){const vals=days===7?[53,46,64,52,94,76,67,114,90,126,95,117,102,151,131,158]:[47,82,55,103,74,123,98,139,112,161,143,174,155,196,172,211];let points=vals.map((v,i)=>`${49+i*31},${194-v*.8}`).join(' ');return `<svg class="chart" viewBox="0 0 550 220" role="img" aria-label="Gráfico ilustrativo de verificações sintéticas ao longo de ${days} dias"><g><line x1="49" y1="30" x2="520" y2="30"/><line x1="49" y1="80" x2="520" y2="80"/><line x1="49" y1="130" x2="520" y2="130"/><line x1="49" y1="180" x2="520" y2="180"/></g><text x="14" y="34">150</text><text x="14" y="84">100</text><text x="20" y="134">50</text><text x="26" y="184">0</text><path class="chart-area" d="M49 180 L${points.replaceAll(' ',' L')} L514 180 Z"/><path class="secondary" d="M49 164 80 159 111 169 142 155 173 160 204 153 235 164 266 147 297 157 328 148 359 159 390 145 421 153 452 140 483 150 514 142"/><polyline points="${points}" fill="none" stroke="#368367" stroke-width="2.5" stroke-linejoin="round"/><g><text x="43" y="208">${days===7?'Seg':'01 nov'}</text><text x="120" y="208">${days===7?'Ter':'06 nov'}</text><text x="197" y="208">${days===7?'Qua':'11 nov'}</text><text x="274" y="208">${days===7?'Qui':'16 nov'}</text><text x="350" y="208">${days===7?'Sex':'21 nov'}</text><text x="427" y="208">${days===7?'Sáb':'26 nov'}</text><text x="500" y="208">${days===7?'Dom':'30 nov'}</text></g></svg>`}
function overview(){return title('Visão geral','Uma visão clara de cada verificação. Um acesso mais seguro.',`<button class="btn" id="export">${icon('download')}Exportar dados</button><button class="btn primary" data-route="verify">${icon('plus')}Nova verificação</button>`)+banner()+`<section class="stats" aria-label="Métricas ilustrativas"><article class="stat"><div class="stat-top">Verificações realizadas ${icon('face')}</div><div class="stat-value">1.284</div><div class="stat-bottom"><b>↗ 12,8%</b> vs. período anterior</div></article><article class="stat"><div class="stat-top">Taxa de aprovação ${icon('shield')}</div><div class="stat-value">98,2<span style="font-size:20px">%</span></div><div class="stat-bottom"><b>↗ 2,4%</b> vs. período anterior</div></article><article class="stat"><div class="stat-top">Tempo médio ${icon('clock')}</div><div class="stat-value">842 <span style="font-size:17px;color:#7d8a81;font-weight:450">ms</span></div><div class="stat-bottom">Exemplo de tempo de resposta</div></article><article class="stat"><div class="stat-top">Revisões necessárias ${icon('activity')}</div><div class="stat-value">23</div><div class="stat-bottom"><b class="warning">1,8% do total</b> valores ilustrativos</div></article></section><section class="dashboard-grid"><article class="panel"><div class="panel-head"><div><h2>Atividade de verificações</h2><p>Volume de solicitações ao longo do tempo</p></div><select class="select" id="chart-period" aria-label="Período do gráfico"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></div><div class="chart-legend"><span><i class="legend-dot"></i>Aprovadas</span><span><i class="legend-dot gray"></i>Revisões</span></div><div id="chart-area">${chart()}</div><div class="chart-foot"><span>Dados de demonstração</span><b>Verificação facial 1:1</b></div></article><article class="panel quick-panel"><div class="scan-symbol">${icon('face')}</div><h2>Uma pessoa.<br>Uma identidade.</h2><p>Compare um rosto com uma referência e acompanhe a prova de vida em um único fluxo.</p><button class="btn primary" data-route="verify">Testar verificação 1:1 ${icon('arrow',16)}</button><small>Conheça o fluxo antes de integrar</small></article></section><section class="panel"><div class="table-head"><div><h2>Verificações recentes</h2><p>Últimas solicitações no seu workspace</p></div><div class="table-tools"><div class="input-search">${icon('search',13)}<input id="search-records" placeholder="Buscar identidade..." aria-label="Buscar identidade"></div><select id="status-filter" class="select" aria-label="Filtrar resultado"><option value="all">Todos os resultados</option><option value="approved">Aprovadas</option><option value="failed">Revisões e falhas</option></select></div></div>${table()}<div class="table-footer"><span id="row-count">${records.length} verificações · ${records.some(x=>x.source==='api')?'eventos da API':'dados sintéticos'}</span><button class="link-button" id="refresh-events">${connected?'Atualizar da API':'Explorar a API'} ${icon('arrow',13)}</button></div></section><div class="health-row"><span><i class="small-dot"></i>Console disponível</span><span>Motor facial: ${connected?'consultar API':'não conectado'}</span><span>Prova de vida: experimental</span><span class="health-right">Python + FastAPI <span class="footer-dot">·</span> API v1</span></div>`}
function verification(){
  const refs=referenceItems();
  return title('Verificação facial 1:1','Escolha um rosto cadastrado, autorize a captura e grave o desafio.',`<button class="btn" id="add-identity">${icon('plus')}Cadastrar rosto</button>`)+
  `<div class="steps"><div class="step active"><span>1</span>Rosto cadastrado</div><div class="step-line"></div><div class="step"><span>2</span>Gravar desafio</div><div class="step-line"></div><div class="step"><span>3</span>Resultado</div></div>
  <div class="verify-grid face-flow"><aside class="panel pad-panel"><h2>Quem será verificado?</h2>
  <label ${refs.length?'class="hidden"':''}>Identificador da pessoa<input id="verify-subject" list="registered-subjects" placeholder="Selecione ou informe o identificador" value="${esc(selectedSubject)}" maxlength="128" autocomplete="off" aria-describedby="reference-status"></label>
  <datalist id="registered-subjects">${refs.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</datalist>
  <p id="reference-status" class="api-status">${!connected?'Conecte a API em Configurações para verificar uma pessoa.':identityLoadError?esc(identityLoadError):refs.length?`${refs.length} ${refs.length===1?'referência disponível':'referências disponíveis'} na API.`:'Nenhum rosto cadastrado. Use Cadastrar rosto antes de verificar.'}</p>
  ${refs.length?`<label>Rostos disponíveis<select id="choose-reference" class="field-input"><option value="">Selecione uma referência</option>${refs.map(x=>`<option value="${esc(x.id)}" ${x.id===selectedSubject?'selected':''}>${esc(x.name)} · ${esc(x.id)}</option>`).join('')}</select></label>`:''}
  <label class="check"><input type="checkbox" id="verify-consent"> A pessoa autorizou esta captura e o uso da biometria.</label>
  <button class="btn full" id="create-session">Preparar novo desafio</button><p class="api-status" id="session-status" role="status">O botão Gravar e verificar prepara a câmera e o desafio automaticamente.</p>
  <hr class="separator"><h2>Como gravar</h2><p class="capture-guide">Mantenha o rosto iluminado e dentro da guia. Durante os 6 segundos, olhe ao centro e vire levemente para os lados conforme a instrução na câmera.</p>
  <div class="note">O motor é experimental. Uma correspondência exige revisão humana e não registra ponto automaticamente.</div></aside>
  <section class="panel capture-panel"><div class="camera"><span class="camera-badge" id="camera-badge">CÂMERA DESLIGADA</span><video id="camera-video" autoplay muted playsinline class="hidden"></video><div class="camera-frame">${icon('face')}</div><p id="camera-instruction" role="status" aria-live="polite">Olhe para a câmera e mantenha o rosto no centro.</p></div>
  <div class="camera-tools"><p>Vídeo de 6 segundos · sem áudio</p><div class="actions"><button class="btn" id="camera-toggle">${icon('camera')}Testar câmera</button><button class="btn primary" id="capture">Gravar e verificar</button></div></div>
  <p id="capture-hint" class="capture-hint" role="status" aria-live="polite">Ao tocar em Gravar e verificar, permita o uso da câmera se o navegador solicitar.</p>
  <div id="verify-result" class="result-box hidden" role="status" aria-live="polite" tabindex="-1"></div></section></div>`;
}
function identitiesPage(){return title('Identidades','Cadastre uma referência facial antes de iniciar a verificação.',`<button class="btn primary" id="add-identity">${icon('plus')}Cadastrar rosto</button><button class="btn" id="refresh-identities">Atualizar lista</button>`)+
  `<section class="panel"><div class="table-head"><div><h2>Referências cadastradas</h2><p>${connected?'Referências salvas no Mac e disponíveis nos aparelhos conectados à mesma API.':'Conecte a API para consultar e cadastrar rostos reais.'}</p></div><span class="status">${identities.length} identidades</span></div>
  ${identityLoadError?`<p class="capture-hint error-text" role="alert">${esc(identityLoadError)}</p>`:''}
  <div class="table-scroll"><table><thead><tr><th>PESSOA</th><th>IDENTIFICADOR</th><th>REFERÊNCIA</th><th>AÇÕES</th></tr></thead><tbody>${identities.length?identities.map(x=>`<tr><td><div class="person"><span class="avatar">${esc(x.initials)}</span><b>${esc(x.name)}</b></div></td><td class="mono">${esc(x.id)}</td><td><span class="status">${x.real?'Cadastrada na API':'Demonstrativa'}</span></td><td><div class="actions">${x.real?`<button class="btn small" data-verify="${esc(x.id)}">Verificar rosto</button>`:''}<button class="link-button" data-remove="${esc(x.id)}">Excluir referência</button></div></td></tr>`).join(''):'<tr><td colspan="4" class="empty">Nenhuma referência cadastrada. Use Cadastrar rosto para começar.</td></tr>'}</tbody></table></div></section>`}
const endpoints=[{method:'POST',path:'/api/v1/sessions',title:'Criar sessão',description:'Vincule a captura a uma identidade cadastrada. A sessão expira em 120 segundos e só pode ser consumida uma vez.',body:{subject_id:'colab_001',consent:true},response:{session_id:'sess_demonstracao',nonce:'nonce_aleatorio',expires_at:1794240000,max_bytes:8388608,max_duration_seconds:8,challenge:['center','turn_left','turn_right']}},{method:'POST',path:'/api/v1/subjects',title:'Cadastrar referência',description:'Cadastre exatamente um rosto por identidade, com consentimento. Envie multipart/form-data com subject_id, consent e reference (JPG ou PNG).',response:{subject_id:'colab_001',status:'enrolled'}},{method:'POST',path:'/api/v1/sessions/{id}/verify',title:'Verificar identidade',description:'Envie o nonce recebido e o vídeo como multipart/form-data. O servidor valida o desafio, chama o motor de prova de vida e compara o rosto com a referência.',response:{session_id:'sess_demonstracao',decision:'review_required',similarity:0.72,threshold:0.363,liveness:{live:true,score:0.81,validated:false},elapsed_ms:1260}},{method:'GET',path:'/api/v1/events',title:'Consultar eventos',description:'Liste até 100 eventos recentes. Os tempos e resultados são medidos pelo servidor.',response:{events:[]}},{method:'GET',path:'/api/v1/health',title:'Estado dos motores',description:'Consulte a disponibilidade do motor facial e da integração de prova de vida. Este endpoint não exige chave.',response:{status:'development',face_engine:'not_configured',liveness:'not_configured',version:'0.1.0'}},{method:'DELETE',path:'/api/v1/subjects/{id}',title:'Excluir referência',description:'Remova a referência, suas sessões e seus eventos. Esta operação não pode ser desfeita.',response:{status:204}}];
endpoints.push({method:'GET',path:'/api/v1/subjects',title:'Listar rostos cadastrados',description:'Consulte até 1.000 referências cadastradas. A resposta contém identificador, nome e data; não contém imagens nem templates biométricos.',response:{subjects:[{subject_id:'teste_001',display_name:'Pessoa de teste',created:1}],has_more:false}});
function codeFor(e){const origin=base||'http://localhost:8000';const slash=' \\\n';let command=`curl -X ${e.method} '${origin}${e.path}'`+slash+'  -H "Authorization: Bearer $VERIFICA_ADMIN_KEY"';if(e.body)command+=slash+"  -H 'Content-Type: application/json'"+slash+`  -d '${JSON.stringify(e.body)}'`;else if(e.method==='POST')command+=e.path.includes('verify')?slash+"  -F 'nonce=NONCE_DA_SESSAO'"+slash+"  -F 'video=@captura.webm'":slash+"  -F 'subject_id=colab_001'"+slash+"  -F 'consent=true'"+slash+"  -F 'reference=@referencia.jpg'";return command}
function apiPage(){const e=endpoints[endpoint];return title('API & documentação','Da primeira chamada à verificação completa. Uma integração direta.',`<a class="btn" href="./verifica-ai-source.zip" download>Baixar projeto</a><button class="btn" id="open-swagger">${icon('code')}OpenAPI / Swagger</button>`)+`<div class="api-grid"><aside class="panel api-menu"><h3>ENDPOINTS · v1</h3>${endpoints.map((x,i)=>`<button class="endpoint ${i===endpoint?'active':''}" data-endpoint="${i}"><span class="method ${x.method.toLowerCase()}">${x.method}</span>${x.title}</button>`).join('')}<button class="endpoint" data-route="architecture">${icon('code',15)}Por que Python?</button></aside><section class="panel api-body"><h2>${e.title}</h2><span class="mono"><b class="method">${e.method}</b> ${e.path}</span><p>${e.description}</p><div class="code-head"><span>cURL · autenticação Bearer</span><button id="copy-code">Copiar código</button></div><pre><code>${esc(codeFor(e))}</code></pre><h3>Resposta de exemplo</h3><div class="api-response">${esc(JSON.stringify(e.response,null,2))}</div><p class="form-note">Resposta ilustrativa. Similaridade não representa probabilidade de identidade.</p>${e.body?`<h3>Experimentar chamada</h3><label>Identificador<input id="playground-subject" value="colab_001"></label><button id="run-api" class="btn primary">${icon('arrow',15)}${connected?'Enviar para a API':'Simular requisição'}</button><div class="api-response margin-top hidden" id="playground-result"></div>`:''}<h3>Erros que sua integração deve tratar</h3><div class="table-scroll"><table><tbody><tr><td class="mono">401</td><td>Chave ausente ou inválida</td></tr><tr><td class="mono">409</td><td>Sessão expirada, usada ou cadastro duplicado</td></tr><tr><td class="mono">413 / 422</td><td>Captura excede o limite ou não atende à qualidade</td></tr><tr><td class="mono">503</td><td>Motor facial ou prova de vida não configurado</td></tr></tbody></table></div></section></div>`}
function settings(){return title('Configurações','Conecte a API e acompanhe os componentes da sua infraestrutura.')+`<div class="two-col"><section class="panel settings-panel"><h2>Conexão com o backend</h2><p>O console hospedado se conecta ao seu servidor Python via HTTPS. As credenciais ficam apenas na memória desta aba.</p><form id="connection-form"><label>URL base da API<input name="base" type="url" required placeholder="https://api.seu-dominio.com" value="${esc(base)}"></label><label>Chave administrativa<input name="token" type="password" required autocomplete="off" placeholder="Sua VERIFICA_ADMIN_KEY" value="${esc(token)}"></label><div class="actions"><button class="btn primary" type="submit">${icon('link',15)}Testar e conectar</button><button class="btn" type="button" id="disconnect">Desconectar</button></div><p class="api-status" id="connection-result">${connected?'Conexão ativa nesta aba.':'Nenhum backend conectado.'}</p></form><div class="note">Configure VERIFICA_ALLOWED_ORIGINS no servidor com a origem deste console. Nunca distribua a chave administrativa em um aplicativo público.</div></section><section class="panel settings-panel"><h2>Componentes do Verifica.ai</h2><p>Uma arquitetura que separa a interface, a identidade e a análise de vídeo.</p><ul class="feature-list"><li>${icon('check')}API · Python + FastAPI <small>Implementada</small></li><li>${icon('face')}Biometria · YuNet + SFace <small>Modelos locais</small></li><li>${icon('activity')}Ações · desafio de movimentos <small>Experimental</small></li><li>${icon('camera')}Objetos · MobileNet SSD <small>Modelo opcional</small></li><li>${icon('shield')}Proteção contra apresentação <small>Validar em campo</small></li></ul><button class="link-button" data-route="architecture">Ver avaliação das linguagens ${icon('arrow',14)}</button></section></div><section class="panel settings-panel margin-top"><h2>Como executar seu backend</h2><p>O código completo inclui API, serviço próprio de visão, testes e documentação. A API pode ser hospedada em uma máquina com CPU; GPU pode ser adicionada após medição.</p><div class="code-head"><span>Terminal · desenvolvimento</span></div><pre><code>python -m venv .venv
pip install -r requirements.txt
python -m backend.download_models
# Defina as chaves e as variáveis do arquivo .env.example
uvicorn backend.main:app --host 0.0.0.0 --port 8000</code></pre><p class="form-note">Consulte o README para iniciar também o serviço de liveness na porta 8001.</p></section>`}
function vision(){return title('Visão computacional','Rostos, objetos e ações em uma captura vinculada a um desafio.',`<button class="btn primary" data-route="verify">${icon('face')}Abrir captura</button>`)+`<div class="demo-banner">${icon('activity',15)}<span><strong>Motor próprio · experimental.</strong> Resultados exigem revisão até a validação ant fraude.</span></div><div class="two-col"><section class="panel settings-panel"><h2>O que o motor analisa</h2><p>O vídeo passa por etapas independentes. Detecção de objetos enriquece o contexto; ela não comprova prova de vida.</p><ul class="feature-list"><li>${icon('face')}Exatamente um rosto por captura<small>YuNet</small></li><li>${icon('activity')}Ordem dos movimentos solicitados<small>Desafio aleatório</small></li><li>${icon('camera')}Objetos presentes no ambiente<small>MobileNet SSD · 20 classes</small></li><li>${icon('shield')}Vínculo do resultado ao vídeo<small>SHA-256 + HMAC</small></li></ul><div class="note">Ações suportadas nesta versão: olhar ao centro e virar a cabeça para os dois lados. A análise usa a posição dos marcos faciais; não inclui detecção de piscadas.</div></section><section class="panel settings-panel"><h2>Um desafio diferente por sessão</h2><p>O servidor escolhe a sequência e mantém o desafio associado ao nonce. O cliente recebe as instruções, grava e envia o vídeo.</p><div class="action-list"><span class="action-tag">Olhe ao centro</span><span class="action-tag">Vire para a esquerda</span><span class="action-tag">Vire para a direita</span></div><hr class="separator"><h2>Próximos critérios de validação</h2><p>Medir ataques com foto impressa, tela, replay, máscaras e vídeos sintéticos; calibrar limiares e avaliar diferentes câmeras, iluminações e perfis de pessoas.</p><div class="info-row"><span>Uso inicial</span><b>Validação para ponto</b></div><div class="info-row"><span>Decisão automática</span><b>Bloqueada no modo experimental</b></div><div class="info-row"><span>Expansão</span><b>Autenticação e acesso</b></div></section></div>`}
function architecture(){return title('Uma base preparada para evoluir','Avaliação técnica para biometria facial, ações e detecção de objetos.',`<button class="btn" data-route="api">${icon('arrow')}Voltar à API</button>`)+`<section class="panel settings-panel"><h2>Python + FastAPI <span class="tag">Escolha para o Verifica.ai</span></h2><p>O custo dominante é a inferência dos modelos. Python permite integrar OpenCV, ONNX Runtime e ferramentas de treinamento com menos atrito. O processamento pesado roda em código nativo e em trabalhadores separados.</p><div class="table-scroll"><table class="tech-table"><thead><tr><th>LINGUAGEM</th><th>PONTOS FORTES</th><th>CUSTO PARA ESTE PROJETO</th><th>INDICAÇÃO</th></tr></thead><tbody><tr><td><b>Python</b></td><td>Ecossistema de visão, experimentação e treinamento</td><td>Exige limitar concorrência e separar inferência da API</td><td>API e motor de visão inicial</td></tr><tr><td><b>Go</b></td><td>Concorrência, serviços leves e distribuição simples</td><td>Mais integração para modelos e pré-processamento</td><td>Gateway de alto volume após medição</td></tr><tr><td><b>Rust</b></td><td>Controle de memória e latência previsível</td><td>Maior esforço de desenvolvimento e integração de visão</td><td>Agentes locais e componentes críticos</td></tr><tr><td><b>C#</b></td><td>ASP.NET Core, ONNX Runtime e integrações empresariais</td><td>Menor variedade de ferramentas de pesquisa e treino</td><td>Boa opção para equipes .NET</td></tr></tbody></table></div><h2 class="margin-top">Otimização antes de escalar</h2><p>Upload binário, vídeo curto e sem áudio; no máximo oito quadros na comparação 1:1; resolução reduzida para inferência; modelos carregados uma vez por processo; concorrência limitada. O serviço de ações usa amostragem temporal própria. Testes de carga e calibração ainda são necessários: não há promessa de latência ou precisão nesta versão.</p></section>`}
function stopCamera(){cameraGeneration++;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
function render(){const next=location.hash.slice(1)||'overview';if(route==='verify'){sessionGeneration++;activeSession=null;stopCamera();}route=next in routes||next==='architecture'?next:'overview';document.querySelector('#crumb').textContent=routes[route]?.[0]||'Arquitetura';document.querySelector('#nav').innerHTML=Object.entries(routes).map(([key,[label,i]])=>`<button data-route="${key}" class="nav-link ${route===key?'active':''}">${icon(i)}${label}${key==='api'?'<span class="badge">v1</span>':''}</button>`).join('');document.querySelector('#main').innerHTML=({overview,verify:verification,identities:identitiesPage,vision,api:apiPage,settings,architecture}[route])();bind();}
function filterRows(){const query=(document.querySelector('#search-records')?.value||'').toLowerCase();const f=document.querySelector('#status-filter')?.value||'all';const rows=records.filter(x=>(x.name+' '+x.subject+' '+x.id).toLowerCase().includes(query)&&(f==='all'||(f==='failed'?x.status!=='approved':x.status==='approved')));document.querySelector('#record-rows').innerHTML=rowsHTML(rows);document.querySelector('#row-count').textContent=`${rows.length} verificações · ${rows.some(x=>x.source==='api')?'eventos da API':'dados sintéticos'}`;}
function bind(){document.querySelector('#chart-period')?.addEventListener('change',e=>document.querySelector('#chart-area').innerHTML=chart(+e.target.value));document.querySelector('#search-records')?.addEventListener('input',filterRows);document.querySelector('#status-filter')?.addEventListener('change',filterRows);document.querySelector('#export')?.addEventListener('click',()=>{const csv='\uFEFFidentidade;identificador;resultado;tempo_ms;tipo\n'+records.map(x=>[x.name,x.subject,x.status,x.ms,x.source||'demonstracao'].join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='verifica-ai-verificacoes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Exportação CSV concluída.')});document.querySelector('#refresh-events')?.addEventListener('click',async()=>{if(!connected)return goto('api');try{const out=await request('/api/v1/events');records=out.events.map(x=>({id:x.id,name:x.subject,subject:x.subject,status:x.status,date:new Date(x.created*1000).toLocaleString('pt-BR'),ms:x.elapsed,source:'api',backend:base,initials:x.subject.slice(0,2).toUpperCase()}));render();toast('Eventos atualizados da API.')}catch(e){toast(e.message)}});document.querySelector('#add-identity')?.addEventListener('click',openIdentityDialog);document.querySelector('#refresh-identities')?.addEventListener('click',refreshIdentities);document.querySelector('#choose-reference')?.addEventListener('change',e=>{const field=document.querySelector('#verify-subject');field.value=e.target.value;field.dispatchEvent(new Event('input'))});document.querySelector('#camera-toggle')?.addEventListener('click',toggleCamera);document.querySelector('#create-session')?.addEventListener('click',createSession);document.querySelector('#capture')?.addEventListener('click',capture);for(const selector of ['#verify-subject','#verify-consent'])document.querySelector(selector)?.addEventListener('input',()=>{selectedSubject=document.querySelector('#verify-subject').value.trim();sessionGeneration++;if(activeSession){activeSession=null;document.querySelector('#capture').disabled=false;document.querySelector('#session-status').textContent='Dados alterados. Crie uma nova sessão com a autorização atual.';document.querySelector('#camera-instruction').textContent='Crie uma nova sessão para receber o desafio.';document.querySelectorAll('.step').forEach((el,i)=>el.classList.toggle('active',i===0));}});document.querySelector('#simulate')?.addEventListener('click',()=>{showResult('Demonstração · revisão necessária','Rosto correspondente no exemplo. Desafio de movimentos concluído no exemplo. O motor experimental exige revisão humana; este resultado não valida uma pessoa real.');document.querySelectorAll('.step').forEach(x=>x.classList.add('active'))});document.querySelector('#copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(codeFor(endpoints[endpoint]));toast('Código copiado.')}catch{toast('Seu navegador bloqueou a cópia. Selecione o código e copie.')}});document.querySelector('#open-swagger')?.addEventListener('click',()=>{if(!base)return toast('Conecte o backend para acessar o Swagger.');window.open(base+'/docs','_blank','noopener,noreferrer')});document.querySelector('#run-api')?.addEventListener('click',async(e)=>{const out=document.querySelector('#playground-result');out.classList.remove('hidden');e.currentTarget.disabled=true;try{const subject=document.querySelector('#playground-subject').value;out.textContent=connected?JSON.stringify(await request('/api/v1/sessions','POST',{subject_id:subject,consent:true}),null,2):'SIMULAÇÃO — nenhuma requisição enviada\n'+JSON.stringify({...endpoints[0].response,subject_id:subject},null,2)}catch(err){out.textContent=err.message}finally{if(e.target.isConnected)e.target.disabled=false}});document.querySelector('#connection-form')?.addEventListener('submit',connect);document.querySelector('#disconnect')?.addEventListener('click',()=>{connectionGeneration++;identityGeneration++;base='';token='';connected=false;activeSession=null;selectedSubject='';identityLoadError='';records=[...sample];identities=sample.map(x=>({id:x.subject,name:x.name,initials:x.initials}));render();toast('Backend desconectado. Credenciais removidas da memória.')});}
function showResult(title,text,error=false,technical=null){
  const el=document.querySelector('#verify-result');if(!el)return;
  el.classList.remove('hidden');el.innerHTML=`<strong class="${error?'error-text':''}">${esc(title)}</strong><p>${esc(text)}</p>${technical?`<details><summary>Detalhes técnicos</summary><pre>${esc(JSON.stringify(technical,null,2))}</pre></details>`:''}`;
  el.scrollIntoView?.({behavior:'smooth',block:'nearest'});
}
function captureHint(text){const el=document.querySelector('#capture-hint');if(el)el.textContent=text}
function actionLabel(action){return {center:'Olhe ao centro',turn_left:'Vire levemente para a esquerda',turn_right:'Vire levemente para a direita'}[action]||action}
function validateVerification(){
  if(!connected)throw Error('Conecte a API em Configurações antes de verificar.');
  const subject=document.querySelector('#verify-subject').value.trim();
  if(!subject||!/^[a-zA-Z0-9_.@-]{1,128}$/.test(subject))throw Error('Selecione ou informe o identificador do rosto cadastrado.');
  if(!document.querySelector('#verify-consent').checked)throw Error('Marque a autorização de captura antes de gravar.');
  selectedSubject=subject;return subject;
}
async function startCamera(){
  if(stream?.getVideoTracks().some(t=>t.readyState==='live'))return true;
  if(!navigator.mediaDevices?.getUserMedia)throw Error('A câmera exige o link HTTPS. Abra o link diretamente no Chrome ou Safari.');
  const generation=++cameraGeneration;
  let acquired;
  try{
    acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    const video=document.querySelector('#camera-video');
    if(generation!==cameraGeneration||route!=='verify'||!video){acquired.getTracks().forEach(t=>t.stop());return false}
    stream=acquired;video.srcObject=stream;video.classList.remove('hidden');
    let playTimeout;
    try{await Promise.race([video.play(),new Promise((resolve,reject)=>{playTimeout=setTimeout(()=>reject(Error('A prévia da câmera não iniciou. Feche outros aplicativos de câmera e tente novamente.')),8000)})])}finally{clearTimeout(playTimeout)}
    if(!video.videoWidth||!video.videoHeight)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(Error('A câmera não iniciou a prévia. Feche outros aplicativos de câmera e tente novamente.'))},8000);
      function cleanup(){clearTimeout(timer);video.removeEventListener('loadeddata',ready)}
      function ready(){if(video.videoWidth&&video.videoHeight){cleanup();resolve()}}
      video.addEventListener('loadeddata',ready);ready();
    });
    if(generation!==cameraGeneration||route!=='verify'){acquired.getTracks().forEach(t=>t.stop());return false}
    document.querySelector('#camera-toggle').textContent='Desligar câmera';
    document.querySelector('#camera-badge').textContent='CÂMERA PRONTA';
    captureHint('Câmera pronta. O desafio será mostrado durante a gravação.');return true;
  }catch(error){
    if(acquired){acquired.getTracks().forEach(t=>t.stop());if(stream===acquired)stream=null}
    const messages={NotAllowedError:'Permita a câmera nas configurações deste site e tente novamente.',NotFoundError:'Nenhuma câmera encontrada neste aparelho.',NotReadableError:'A câmera está ocupada. Feche outros aplicativos e tente novamente.'};
    throw Error(messages[error.name]||error.message);
  }
}
async function toggleCamera(){
  if(recording||preparing)return;
  if(stream){stopCamera();document.querySelector('#camera-video').classList.add('hidden');document.querySelector('#camera-toggle').textContent='Testar câmera';document.querySelector('#camera-badge').textContent='CÂMERA DESLIGADA';captureHint('Toque em Gravar e verificar para ligar a câmera e iniciar.');return}
  const button=document.querySelector('#camera-toggle');button.disabled=true;
  try{await startCamera()}catch(error){showResult('Não foi possível abrir a câmera',error.message,true)}finally{if(button.isConnected)button.disabled=false}
}
async function createSession(automatic=false){
  if(recording||(preparing&&automatic!==true))return null;
  const button=document.querySelector('#create-session'),subject=document.querySelector('#verify-subject'),consent=document.querySelector('#verify-consent');
  let requestedSubject;try{requestedSubject=validateVerification()}catch(error){showResult('Prepare a verificação',error.message,true);captureHint(error.message);return null}
  const generation=++sessionGeneration,context={base,token};
  activeSession=null;button.disabled=true;subject.disabled=true;consent.disabled=true;
  try{
    const result=await request('/api/v1/sessions','POST',{subject_id:requestedSubject,consent:true},context);
    if(generation!==sessionGeneration||!sameConnection(context)||route!=='verify'||!button.isConnected||subject.value.trim()!==requestedSubject||!consent.checked)return null;
    activeSession={...result,subject_id:requestedSubject};
    document.querySelector('#session-status').textContent='Desafio preparado. A sessão vale por 120 segundos.';
    document.querySelector('#camera-instruction').textContent=result.challenge.map(actionLabel).join(' → ');
    document.querySelectorAll('.step')[1].classList.add('active');return activeSession;
  }catch(error){
    if(button.isConnected&&generation===sessionGeneration){document.querySelector('#session-status').textContent=error.message;showResult('Não foi possível preparar o desafio',error.message,true);captureHint(error.message)}return null;
  }finally{if(button.isConnected){button.disabled=false;subject.disabled=false;consent.disabled=false}}
}
async function capture(){
  if(recording||preparing){captureHint('Aguarde: a verificação já está em andamento.');return}
  const button=document.querySelector('#capture'),cameraButton=document.querySelector('#camera-toggle'),sessionButton=document.querySelector('#create-session');
  const context={base,token};preparing=true;button.disabled=true;cameraButton.disabled=true;sessionButton.disabled=true;
  let recorder,timer,instructions,watchdog;
  try{
    const subject=validateVerification();
    document.querySelector('#verify-subject').disabled=true;document.querySelector('#verify-consent').disabled=true;if(document.querySelector('#choose-reference'))document.querySelector('#choose-reference').disabled=true;
    if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')throw Error('Este navegador não suporta gravação. Abra no Safari ou Chrome atualizado.');
    const mime=['video/webm;codecs=vp8','video/webm','video/mp4;codecs=avc1.42E01E','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw Error('Nenhum formato de gravação compatível. Atualize o Safari ou Chrome.');
    button.textContent='Preparando câmera…';captureHint('Permita o uso da câmera no navegador.');
    if(!await startCamera())return;
    if(!button.isConnected||!sameConnection(context))return;
    validateVerification();
    if(!activeSession||activeSession.expires_at<=Date.now()/1000||activeSession.subject_id!==subject){button.textContent='Preparando desafio…';if(!await createSession(true))return}
    if(!button.isConnected||!sameConnection(context))return;
    const session={...activeSession};
    document.querySelector('#verify-subject').disabled=true;document.querySelector('#verify-consent').disabled=true;sessionButton.disabled=true;
    preparing=false;recording=true;document.querySelector('#verify-result').classList.add('hidden');document.querySelector('.capture-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
    const chunks=[];
    const blob=await new Promise((resolve,reject)=>{
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:650000});
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      recorder.onerror=()=>reject(Error('Falha ao gravar. Reabra a câmera e tente novamente.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
      recorder.start(250);
      const started=Date.now();
      function update(){
        if(!button.isConnected||route!=='verify'){if(recorder.state!=='inactive')recorder.stop();return}
        const elapsed=Date.now()-started,index=Math.min(2,Math.floor(elapsed/2000));
        document.querySelector('#camera-instruction').textContent=actionLabel(session.challenge[index]);
        document.querySelector('#camera-badge').textContent='GRAVANDO · '+Math.max(1,Math.ceil((6000-elapsed)/1000))+' s';
        button.textContent='Gravando… '+Math.max(1,Math.ceil((6000-elapsed)/1000))+' s';
      }
      update();instructions=setInterval(update,200);
      timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop()},6000);
      watchdog=setTimeout(()=>reject(Error('A gravação não terminou. Feche e abra a câmera para tentar novamente.')),10000);
    });
    clearInterval(instructions);clearTimeout(watchdog);
    if(!blob.size)throw Error('A câmera gerou um vídeo vazio. Tente novamente com o navegador em primeiro plano.');
    if(blob.size>8*1024*1024)throw Error('O vídeo excedeu 8 MiB. Tente novamente.');
    if(route!=='verify'||activeSession?.session_id!==session.session_id||!sameConnection(context))throw Error('A verificação foi interrompida. Prepare um novo desafio.');
    button.textContent='Analisando…';document.querySelector('#camera-badge').textContent='ANALISANDO';captureHint('Vídeo enviado. Aguarde a análise no Mac.');
    const data=new FormData();data.append('nonce',session.nonce);data.append('video',blob,mime.includes('mp4')?'capture.mp4':'capture.webm');
    const result=await request('/api/v1/sessions/'+session.session_id+'/verify','POST',data,context);
    if(!button.isConnected||!sameConnection(context))return;
    const messages={approved:['Identidade aprovada','A comparação e a prova de vida foram aprovadas.'],review_required:['Revisão humana necessária','O rosto correspondeu à referência e o desafio foi concluído. O motor experimental exige revisão humana.'],liveness_failed:['Desafio não concluído','Repita mantendo o rosto na guia e seguindo cada instrução durante a gravação.'],face_mismatch:['O rosto não corresponde à referência','Confira o identificador selecionado e a foto cadastrada.']};
    const message=messages[result.decision]||['Resultado não reconhecido','Consulte os detalhes técnicos.'];
    showResult(...message,['liveness_failed','face_mismatch'].includes(result.decision),result);
    document.querySelectorAll('.step').forEach(step=>step.classList.add('active'));captureHint('Verificação concluída. Para repetir, toque em Gravar e verificar.');
  }catch(error){if(button.isConnected){showResult('Não foi possível verificar',error.message,true);captureHint(error.message)}}
  finally{
    clearTimeout(timer);clearTimeout(watchdog);clearInterval(instructions);
    if(recorder&&recorder.state!=='inactive')recorder.stop();
    recording=false;preparing=false;activeSession=null;
    if(button.isConnected){button.disabled=false;button.textContent='Gravar e verificar';cameraButton.disabled=false;sessionButton.disabled=false;document.querySelector('#session-status').textContent='A próxima gravação receberá um novo desafio.';document.querySelector('#verify-subject').disabled=false;document.querySelector('#verify-consent').disabled=false;if(document.querySelector('#choose-reference'))document.querySelector('#choose-reference').disabled=false;document.querySelector('#camera-badge').textContent=stream?'CÂMERA PRONTA':'CÂMERA DESLIGADA'}
  }
}
async function connect(event){
  event.preventDefault();const form=event.currentTarget,candidate=form.elements.namedItem('base').value.trim().replace(/\/$/,''),key=form.elements.namedItem('token').value;
  const out=document.querySelector('#connection-result'),button=form.querySelector('button'),generation=++connectionGeneration;
  button.disabled=true;out.classList.remove('error-text');out.textContent='Testando conexão e autenticação…';
  try{
    const parsed=new URL(candidate);
    if(!['https:','http:'].includes(parsed.protocol)||(parsed.protocol==='http:'&&!['localhost','127.0.0.1'].includes(parsed.hostname)))throw Error('Use HTTPS, ou localhost para desenvolvimento.');
    const context={base:candidate,token:key};await request('/api/v1/events','GET',undefined,context);const health=await request('/api/v1/health','GET',undefined,context);
    if(generation!==connectionGeneration||!button.isConnected)return;
    if(base!==candidate||token!==key){identities=[];records=[...sample];activeSession=null;selectedSubject=''}
    base=candidate;token=key;connected=true;identityLoadError='';
    try{await loadIdentities(context)}catch(error){if(sameConnection(context)){identities=[];identityLoadError=error.message}}
    if(generation!==connectionGeneration||!button.isConnected)return;
    out.textContent=`Conectado · motor facial: ${health.face_engine} · liveness: ${health.liveness}${identityLoadError?' · '+identityLoadError:''}`;
    toast('API conectada. Rostos consultados no servidor.');
  }catch(error){if(generation===connectionGeneration&&out.isConnected){out.textContent=error.message;out.classList.add('error-text')}}finally{if(button.isConnected)button.disabled=false}
}
document.addEventListener('click',async e=>{const nav=e.target.closest('[data-route]');if(nav)goto(nav.dataset.route);const ep=e.target.closest('[data-endpoint]');if(ep){endpoint=+ep.dataset.endpoint;render()}const detail=e.target.closest('[data-detail]');if(detail){const r=records.find(x=>x.id===detail.dataset.detail);toast(`${r.id} · ${r.subject} · ${r.status} · ${r.ms} ms ${r.source==='api'?'· evento da API':'· exemplo sintético'}`)}const remove=e.target.closest('[data-remove]');if(remove){const id=remove.dataset.remove;const item=identities.find(x=>x.id===id);if(item?.real){if(!connected||item.backend!==base)return toast('Reconecte o backend original desta referência.');if(!confirm('Excluir permanentemente esta referência e seus eventos?'))return;try{await request('/api/v1/subjects/'+encodeURIComponent(id),'DELETE')}catch(err){return toast(err.message)}}identityGeneration++;identities=identities.filter(x=>x.id!==id);if(selectedSubject===id)selectedSubject='';render();toast('Referência excluída.')}});

async function refreshIdentities(){
  if(!connected){goto('settings');return}
  const context={base,token};try{await loadIdentities(context);if(sameConnection(context)&&['identities','verify'].includes(route))render()}catch(error){if(sameConnection(context)){identityLoadError=error.message;toast(error.message)}}
}
function openIdentityDialog(){
  if(!connected){goto('settings');toast('Conecte a API antes de cadastrar um rosto real.');return}
  if(recording||preparing)return;
  stopCamera();activeSession=null;sessionGeneration++;
  const form=document.querySelector('#identity-form');form.reset();referenceFile=null;referenceError='';referencePending=null;referenceGeneration++;
  document.querySelector('#reference-preview').classList.add('hidden');document.querySelector('#identity-error').textContent='';
  document.querySelector('#identity-note').textContent='A foto será enviada à API. Use um rosto de frente, nítido e bem iluminado.';
  document.querySelector('#identity-dialog').showModal();
}
async function prepareReference(file){
  if(!file)throw Error('Selecione ou tire uma foto de referência.');
  const type=file.type||(/\.jpe?g$/i.test(file.name)?'image/jpeg':/\.png$/i.test(file.name)?'image/png':'');
  if(!['image/jpeg','image/png'].includes(type))throw Error('Use uma foto JPEG ou PNG. No iPhone/iPad, exporte fotos HEIC como JPEG.');
  if(file.size>20*1024*1024)throw Error('A foto excede 20 MiB. Escolha uma imagem menor.');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Não foi possível abrir a foto. Escolha outro JPEG ou PNG.'));img.src=url});
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
    if(!blob||!blob.size||blob.size>8*1024*1024)throw Error('Não foi possível preparar uma foto de até 8 MiB. Escolha outra imagem.');
    return new File([blob],'referencia.jpg',{type:'image/jpeg'});
  }finally{URL.revokeObjectURL(url)}
}
function referenceChanged(event){
  const file=event.target.files[0],generation=++referenceGeneration;referenceFile=null;referenceError='';document.querySelector('#identity-error').textContent='';document.querySelector('#reference-preview').classList.add('hidden');
  referencePending=(async()=>{
    try{
      const prepared=await prepareReference(file);if(generation!==referenceGeneration)return;
      referenceFile=prepared;const image=document.querySelector('#reference-preview'),url=URL.createObjectURL(prepared);image.onload=()=>URL.revokeObjectURL(url);image.onerror=()=>URL.revokeObjectURL(url);image.src=url;image.classList.remove('hidden');
      document.querySelector('#identity-note').textContent='Confira a foto. Deve haver um único rosto, de frente e sem desfoque.';
    }catch(error){if(generation===referenceGeneration){referenceError=error.message;document.querySelector('#identity-error').textContent=error.message}}
  })();
}
async function enrollIdentity(event){
  event.preventDefault();if(enrolling)return;
  const form=event.currentTarget,error=document.querySelector('#identity-error'),button=form.querySelector('button[type=submit]'),context={base,token};
  error.textContent='';if(!form.reportValidity())return;
  if(!connected){error.textContent='Conecte a API antes de cadastrar.';return}
  const id=form.elements.namedItem('id').value.trim(),name=form.elements.namedItem('name').value.trim();
  if(!name||!/^[a-zA-Z0-9_.@-]{1,128}$/.test(id)||!form.elements.namedItem('consent').checked){error.textContent='Informe nome, identificador válido e autorização.';return}
  enrolling=true;button.disabled=true;button.textContent='Cadastrando rosto…';for(const input of form.querySelectorAll('input'))input.disabled=true;
  try{
    if(referencePending)await referencePending;
    if(referenceError)throw Error(referenceError);
    const photo=referenceFile||form.elements.namedItem('reference').files[0]||form.elements.namedItem('camera-reference').files[0];
    if(!photo)throw Error('Selecione ou tire uma foto de referência.');
    if(!['image/jpeg','image/png'].includes(photo.type)||photo.size>8*1024*1024)throw Error('Use uma foto JPEG/PNG de até 8 MiB.');
    if(!sameConnection(context))throw Error('A conexão mudou. Confira o servidor antes de cadastrar.');
    const data=new FormData();data.append('subject_id',id);data.append('display_name',name);data.append('consent','true');data.append('reference',photo);
    await request('/api/v1/subjects','POST',data,context);
    if(!sameConnection(context))throw Error('O cadastro foi enviado à API anterior. Reconecte aquele servidor para consultá-lo.');
    identityGeneration++;identities=identities.filter(item=>item.id!==id);identities.unshift({id,name,initials:name.slice(0,2).toUpperCase(),real:true,backend:context.base});selectedSubject=id;
    document.querySelector('#identity-dialog').close();form.reset();referenceFile=null;referencePending=null;goto('verify');toast('Rosto cadastrado. Autorize a captura e toque em Gravar e verificar.');
  }catch(failure){error.textContent=failure.message}
  finally{enrolling=false;button.disabled=false;button.textContent='Cadastrar e verificar';for(const input of form.querySelectorAll('input'))input.disabled=false}
}
document.querySelector('#identity-form').addEventListener('submit',enrollIdentity);
for(const name of ['reference','camera-reference'])document.querySelector(`[name="${name}"]`).addEventListener('change',referenceChanged);
document.querySelector('#identity-dialog').addEventListener('cancel',event=>{if(enrolling)event.preventDefault()});
document.querySelector('#identity-dialog').addEventListener('close',()=>{referenceGeneration++;referenceFile=null;referencePending=null});
document.querySelector('#close-dialog').onclick=()=>{if(!enrolling)document.querySelector('#identity-dialog').close()};
document.addEventListener('click',event=>{const button=event.target.closest('[data-verify]');if(button&&!recording&&!preparing){selectedSubject=button.dataset.verify;goto('verify')}});
document.querySelector('#help').innerHTML=icon('help',18);document.querySelector('#help').onclick=()=>goto('api');window.addEventListener('hashchange',render);window.addEventListener('pagehide',stopCamera);render();
