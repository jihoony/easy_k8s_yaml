/* =====================================================
   Easy K8s YAML Generator — Frontend Logic
   ===================================================== */

// ----- State -----
const state = {
  yamls: { secret: null, configmap: null, service: null, deployment: null },
  uploadedFiles: [], // ConfigMap files
  secretFiles: [],   // Secret files
  serviceType: 'clusterip',
  envVarCount: 0,
  secretVarCount: 0,
  depCustomEnvCount: 0,
  manualMountCount: 0,
};

// ----- Init -----
document.addEventListener('DOMContentLoaded', () => {
  updateMountItemsUI();
  updateSecretMountItemsUI();
  updateEnvInjectUI();
  updateSecretEnvInjectUI();
  restoreTheme(); // Sync UI buttons with current theme state
});

/* =====================================================
   Section Folding (Toggle)
   ===================================================== */
function toggleSection(type) {
  const section = document.getElementById(`section-${type}`);
  if (section) {
    section.classList.toggle('collapsed');
  }
}

/* =====================================================
   Section Done Badges
   ===================================================== */
function markSectionDone(type) {
  const badge = document.getElementById(`done-${type}`);
  if (badge) badge.style.display = '';
}

/* =====================================================
   Secret — Key-Value Data
   ===================================================== */
function addSecretVar(key = '', val = '') {
  state.secretVarCount++;
  const id = state.secretVarCount;

  const row = document.createElement('div');
  row.className = 'env-var-row';
  row.id = `secret-row-${id}`;
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="KEY"
           id="secret-key-${id}" aria-label="Secret 데이터 키"
           value="${escapeHtml(key)}"
           oninput="updateSecretEnvInjectUI()">
    <input type="text" class="form-input" placeholder="VALUE"
           id="secret-val-${id}" aria-label="Secret 데이터 값"
           value="${escapeHtml(val)}">
    <button class="btn-remove" onclick="removeSecretVar(${id})" aria-label="Secret 데이터 삭제">✕</button>
  `;

  document.getElementById('secret-vars-container').appendChild(row);
  document.getElementById('secret-vars-empty').style.display = 'none';
  if (!key) {
    document.getElementById(`secret-key-${id}`).focus();
  }
  updateSecretEnvInjectUI();
}

function removeSecretVar(id) {
  const row = document.getElementById(`secret-row-${id}`);
  if (row) row.remove();
  if (document.querySelectorAll('#secret-vars-container .env-var-row').length === 0) {
    document.getElementById('secret-vars-empty').style.display = '';
  }
  updateSecretEnvInjectUI();
}

function collectSecretVars() {
  return Array.from(document.querySelectorAll('#secret-vars-container .env-var-row')).map(row => {
    const id = row.id.replace('secret-row-', '');
    return {
      key:   (document.getElementById(`secret-key-${id}`) || {}).value?.trim() || '',
      value: (document.getElementById(`secret-val-${id}`) || {}).value || '',
    };
  }).filter(ev => ev.key !== '');
}

/* =====================================================
   Secret — File Upload
   ===================================================== */
function handleSecretFileSelect(e) {
  addSecretFiles(Array.from(e.target.files));
  e.target.value = '';
}

function handleSecretDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('secret-upload-area').classList.remove('drag-over');
  addSecretFiles(Array.from(e.dataTransfer.files));
}

function handleSecretDragOver(e) {
  e.preventDefault();
  document.getElementById('secret-upload-area').classList.add('drag-over');
}

function handleSecretDragLeave() {
  document.getElementById('secret-upload-area').classList.remove('drag-over');
}

function addSecretFiles(newFiles) {
  newFiles.forEach(f => {
    if (!state.secretFiles.find(x => x.name === f.name)) {
      state.secretFiles.push(f);
    }
  });
  renderSecretFileList();
  updateSecretMountItemsUI();
}

function removeSecretFile(name) {
  state.secretFiles = state.secretFiles.filter(f => f.name !== name);
  renderSecretFileList();
  updateSecretMountItemsUI();
}

function renderSecretFileList() {
  const container = document.getElementById('secret-file-list');
  container.innerHTML = '';
  state.secretFiles.forEach(f => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.style.borderColor = 'rgba(252,92,101,0.2)';
    item.style.backgroundColor = 'rgba(252,92,101,0.04)';
    item.innerHTML = `
      <span class="file-item-name" style="color: var(--danger)">🔑 ${escapeHtml(f.name)}</span>
      <span class="file-item-size">${formatBytes(f.size)}</span>
      <button class="file-item-remove" onclick="removeSecretFile('${escapeHtml(f.name)}')" aria-label="파일 제거">✕</button>
    `;
    container.appendChild(item);
  });
}

/* =====================================================
   ConfigMap — Env Vars
   ===================================================== */
function addEnvVar(key = '', val = '') {
  state.envVarCount++;
  const id = state.envVarCount;

  const row = document.createElement('div');
  row.className = 'env-var-row';
  row.id = `env-row-${id}`;
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="KEY"
           id="env-key-${id}" aria-label="환경 변수 키"
           value="${escapeHtml(key)}"
           oninput="updateEnvInjectUI()">
    <input type="text" class="form-input" placeholder="VALUE"
           id="env-val-${id}" aria-label="환경 변수 값"
           value="${escapeHtml(val)}">
    <button class="btn-remove" onclick="removeEnvVar(${id})" aria-label="환경 변수 삭제">✕</button>
  `;

  document.getElementById('env-vars-container').appendChild(row);
  document.getElementById('env-vars-empty').style.display = 'none';
  if (!key) {
    document.getElementById(`env-key-${id}`).focus();
  }
  updateEnvInjectUI();
}

function removeEnvVar(id) {
  const row = document.getElementById(`env-row-${id}`);
  if (row) row.remove();
  if (document.querySelectorAll('#env-vars-container .env-var-row').length === 0) {
    document.getElementById('env-vars-empty').style.display = '';
  }
  updateEnvInjectUI();
}

function collectEnvVars() {
  return Array.from(document.querySelectorAll('#env-vars-container .env-var-row')).map(row => {
    const id = row.id.replace('env-row-', '');
    return {
      key:   (document.getElementById(`env-key-${id}`) || {}).value?.trim() || '',
      value: (document.getElementById(`env-val-${id}`) || {}).value || '',
    };
  }).filter(ev => ev.key !== '');
}

/* =====================================================
   ConfigMap — File Upload
   ===================================================== */
function handleFileSelect(e) {
  addFiles(Array.from(e.target.files));
  e.target.value = '';
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('file-upload-area').classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files));
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('file-upload-area').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('file-upload-area').classList.remove('drag-over');
}

function addFiles(newFiles) {
  newFiles.forEach(f => {
    if (!state.uploadedFiles.find(x => x.name === f.name)) {
      state.uploadedFiles.push(f);
    }
  });
  renderFileList();
  updateMountItemsUI();
}

function removeFile(name) {
  state.uploadedFiles = state.uploadedFiles.filter(f => f.name !== name);
  renderFileList();
  updateMountItemsUI();
}

function renderFileList() {
  const container = document.getElementById('file-list');
  container.innerHTML = '';
  state.uploadedFiles.forEach(f => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-item-name">📄 ${escapeHtml(f.name)}</span>
      <span class="file-item-size">${formatBytes(f.size)}</span>
      <button class="file-item-remove" onclick="removeFile('${escapeHtml(f.name)}')" aria-label="파일 제거">✕</button>
    `;
    container.appendChild(item);
  });
}

/* =====================================================
   Deployment — Secret Mount Items UI
   ===================================================== */
function updateSecretMountItemsUI() {
  const container = document.getElementById('secret-mount-items-container');
  if (!container) return;

  const files = state.secretFiles;

  if (files.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:0.75rem">Secret 파일을 업로드하면 여기에 표시됩니다</p>';
    return;
  }

  // Preserve current values
  const prevState = {};
  container.querySelectorAll('.mount-item-row[data-key]').forEach(row => {
    const key = row.dataset.key;
    prevState[key] = {
      checked:   row.querySelector('.mount-checkbox')?.checked ?? true,
      mountPath: row.querySelector('.mount-path-input')?.value ?? '',
    };
  });
  const isFirstRender = Object.keys(prevState).length === 0;

  container.innerHTML = '';
  files.forEach(f => {
    const prev      = prevState[f.name];
    const checked   = isFirstRender ? true : (prev?.checked ?? true);
    const mountPath = prev?.mountPath || `/etc/secrets/${f.name}`;

    const row = document.createElement('div');
    row.className = 'mount-item-row';
    row.dataset.key = f.name;
    row.innerHTML = `
      <input type="checkbox" class="mount-checkbox" ${checked ? 'checked' : ''}>
      <span class="mount-item-key" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="mount-item-badge file" style="background: rgba(252,92,101,0.15); color: var(--danger); border-color: rgba(252,92,101,0.25)">Secret</span>
      <input type="text" class="form-input mount-path-input"
             placeholder="/etc/secrets/${escapeHtml(f.name)}"
             value="${escapeHtml(mountPath)}"
             aria-label="${escapeHtml(f.name)} 마운트 경로">
    `;
    container.appendChild(row);
  });
}

function selectAllSecretMountItems(select) {
  const container = document.getElementById('secret-mount-items-container');
  if (container) {
    container.querySelectorAll('.mount-checkbox').forEach(cb => { cb.checked = select; });
  }
}

function getSelectedSecretMountItems() {
  const container = document.getElementById('secret-mount-items-container');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.mount-item-row[data-key]'))
    .filter(row => row.querySelector('.mount-checkbox')?.checked)
    .map(row => ({
      key:       row.dataset.key,
      mountPath: row.querySelector('.mount-path-input')?.value.trim()
                 || `/etc/secrets/${row.dataset.key}`,
    }));
}

/* =====================================================
   Deployment — ConfigMap Mount Items UI
   ===================================================== */
function updateMountItemsUI() {
  const container = document.getElementById('mount-items-container');
  if (!container) return;

  const files = state.uploadedFiles;

  if (files.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:0.75rem">파일을 업로드하면 여기에 표시됩니다</p>';
    return;
  }

  // Preserve current values
  const prevState = {};
  container.querySelectorAll('.mount-item-row[data-key]').forEach(row => {
    const key = row.dataset.key;
    prevState[key] = {
      checked:   row.querySelector('.mount-checkbox')?.checked ?? true,
      mountPath: row.querySelector('.mount-path-input')?.value ?? '',
    };
  });
  const isFirstRender = Object.keys(prevState).length === 0;

  container.innerHTML = '';
  files.forEach(f => {
    const prev      = prevState[f.name];
    const checked   = isFirstRender ? true : (prev?.checked ?? true);
    const mountPath = prev?.mountPath || `/etc/config/${f.name}`;

    const row = document.createElement('div');
    row.className = 'mount-item-row';
    row.dataset.key = f.name;
    row.innerHTML = `
      <input type="checkbox" class="mount-checkbox" ${checked ? 'checked' : ''}>
      <span class="mount-item-key" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="mount-item-badge file">파일</span>
      <input type="text" class="form-input mount-path-input"
             placeholder="/etc/config/${escapeHtml(f.name)}"
             value="${escapeHtml(mountPath)}"
             aria-label="${escapeHtml(f.name)} 마운트 경로">
    `;
    container.appendChild(row);
  });
}

function selectAllMountItems(select) {
  const container = document.getElementById('mount-items-container');
  if (container) {
    container.querySelectorAll('.mount-checkbox').forEach(cb => { cb.checked = select; });
  }
}

// Returns [{key, mountPath}] for checked files only
function getSelectedMountItems() {
  const container = document.getElementById('mount-items-container');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.mount-item-row[data-key]'))
    .filter(row => row.querySelector('.mount-checkbox')?.checked)
    .map(row => ({
      key:       row.dataset.key,
      mountPath: row.querySelector('.mount-path-input')?.value.trim()
                 || `/etc/config/${row.dataset.key}`,
    }));
}

/* =====================================================
   Deployment — Secret Env Var Inject UI
   ===================================================== */
function updateSecretEnvInjectUI() {
  const container = document.getElementById('secret-env-inject-container');
  if (!container) return;

  // Collect non-empty keys from Section 1 Secret
  const keys = Array.from(document.querySelectorAll('#secret-vars-container .env-var-row')).map(row => {
    const id = row.id.replace('secret-row-', '');
    return document.getElementById(`secret-key-${id}`)?.value?.trim() || '';
  }).filter(k => k !== '');

  if (keys.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:0.75rem">Section 1에서 Secret 데이터를 추가하면 여기에 표시됩니다</p>';
    return;
  }

  // Preserve checked state
  const prevChecked = new Set(
    Array.from(container.querySelectorAll('.secret-env-inject-cb:checked')).map(cb => cb.dataset.key)
  );
  const isFirstRender = container.querySelectorAll('.secret-env-inject-cb').length === 0;

  container.innerHTML = '';
  keys.forEach(key => {
    const checked = isFirstRender || prevChecked.has(key);
    const row = document.createElement('div');
    row.className = 'env-inject-row';
    row.innerHTML = `
      <input type="checkbox" class="mount-checkbox secret-env-inject-cb"
             data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
      <span class="mount-item-key" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
      <span class="mount-item-badge envvar" style="background: rgba(252,92,101,0.15); color: var(--danger); border-color: rgba(252,92,101,0.25)">Secret</span>
    `;
    container.appendChild(row);
  });
}

function selectAllSecretEnvKeys(select) {
  document.querySelectorAll('.secret-env-inject-cb').forEach(cb => { cb.checked = select; });
}

function getSelectedSecretEnvKeys() {
  return Array.from(document.querySelectorAll('.secret-env-inject-cb:checked')).map(cb => cb.dataset.key);
}

/* =====================================================
   Deployment — ConfigMap Env Var Inject UI
   ===================================================== */
function updateEnvInjectUI() {
  const container = document.getElementById('env-inject-container');
  if (!container) return;

  // Collect non-empty env var keys from Section 2 ConfigMap
  const keys = Array.from(document.querySelectorAll('#env-vars-container .env-var-row')).map(row => {
    const id = row.id.replace('env-row-', '');
    return document.getElementById(`env-key-${id}`)?.value?.trim() || '';
  }).filter(k => k !== '');

  if (keys.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:0.75rem">Section 2에서 환경 변수를 추가하면 여기에 표시됩니다</p>';
    return;
  }

  // Preserve checked state
  const prevChecked = new Set(
    Array.from(container.querySelectorAll('.env-inject-cb:checked')).map(cb => cb.dataset.key)
  );
  const isFirstRender = container.querySelectorAll('.env-inject-cb').length === 0;

  container.innerHTML = '';
  keys.forEach(key => {
    const checked = isFirstRender || prevChecked.has(key);
    const row = document.createElement('div');
    row.className = 'env-inject-row';
    row.innerHTML = `
      <input type="checkbox" class="mount-checkbox env-inject-cb"
             data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
      <span class="mount-item-key" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
      <span class="mount-item-badge envvar">환경변수</span>
    `;
    container.appendChild(row);
  });
}

function selectAllEnvKeys(select) {
  document.querySelectorAll('.env-inject-cb').forEach(cb => { cb.checked = select; });
}

function getSelectedEnvKeys() {
  return Array.from(document.querySelectorAll('.env-inject-cb:checked')).map(cb => cb.dataset.key);
}

/* =====================================================
   Deployment — Custom Env Vars
   ===================================================== */
function addDepCustomEnvVar(key = '', val = '') {
  state.depCustomEnvCount++;
  const id = state.depCustomEnvCount;

  const row = document.createElement('div');
  row.className = 'env-var-row';
  row.id = `dep-custom-env-row-${id}`;
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="KEY"
           id="dep-custom-env-key-${id}" value="${escapeHtml(key)}" aria-label="직접 추가 환경 변수 키">
    <input type="text" class="form-input" placeholder="VALUE"
           id="dep-custom-env-val-${id}" value="${escapeHtml(val)}" aria-label="직접 추가 환경 변수 값">
    <button class="btn-remove" onclick="removeDepCustomEnvVar(${id})" aria-label="직접 추가 환경 변수 삭제">✕</button>
  `;

  document.getElementById('dep-custom-env-container').appendChild(row);
  document.getElementById('dep-custom-env-empty').style.display = 'none';
  if (!key) {
    document.getElementById(`dep-custom-env-key-${id}`).focus();
  }
}

function removeDepCustomEnvVar(id) {
  const row = document.getElementById(`dep-custom-env-row-${id}`);
  if (row) row.remove();
  if (document.querySelectorAll('#dep-custom-env-container .env-var-row').length === 0) {
    document.getElementById('dep-custom-env-empty').style.display = '';
  }
}

function collectDepCustomEnvVars() {
  return Array.from(document.querySelectorAll('#dep-custom-env-container .env-var-row')).map(row => {
    const id = row.id.replace('dep-custom-env-row-', '');
    return {
      key:   (document.getElementById(`dep-custom-env-key-${id}`) || {}).value?.trim() || '',
      value: (document.getElementById(`dep-custom-env-val-${id}`) || {}).value || '',
    };
  }).filter(ev => ev.key !== '');
}

/* =====================================================
   Service — Type Selector
   ===================================================== */
function selectServiceType(type) {
  state.serviceType = type;
  document.getElementById('type-clusterip').classList.toggle('active', type === 'clusterip');
  document.getElementById('type-clusterip').setAttribute('aria-checked', type === 'clusterip');
  document.getElementById('type-nodeport').classList.toggle('active', type === 'nodeport');
  document.getElementById('type-nodeport').setAttribute('aria-checked', type === 'nodeport');
  document.getElementById('nodeport-group').style.display = (type === 'nodeport') ? '' : 'none';
}

/* =====================================================
   API: Generate Secret
   ===================================================== */
async function generateSecret(isSilent = false) {
  const name = document.getElementById('app-name').value.trim();
  if (!name) {
    if (!isSilent) {
      showToast('앱 이름을 입력하세요', 'error');
      document.getElementById('app-name').focus();
    }
    return;
  }
  const namespace = document.getElementById('app-namespace').value.trim();

  const secretVars = collectSecretVars();
  if (secretVars.length === 0 && state.secretFiles.length === 0) {
    if (!isSilent) {
      showToast('Secret 데이터 또는 파일을 하나 이상 추가하세요', 'error');
    }
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('namespace', namespace);
  formData.append('envVars', JSON.stringify(secretVars));
  state.secretFiles.forEach(f => formData.append('files', f, f.name));

  if (!isSilent) showLoading();
  try {
    const res  = await fetch('/api/secret', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    displayYaml('secret', data.yaml);
    markSectionDone('secret');
    if (!isSilent) showToast('Secret YAML 생성 완료!', 'success');
  } catch (err) {
    showYamlError('secret', err.message);
    if (!isSilent) showToast('오류: ' + err.message, 'error');
    if (isSilent) throw err;
  } finally {
    if (!isSilent) hideLoading();
  }
}

/* =====================================================
   API: Generate ConfigMap
   ===================================================== */
async function generateConfigMap(isSilent = false) {
  const name = document.getElementById('app-name').value.trim();
  if (!name) {
    if (!isSilent) {
      showToast('앱 이름을 입력하세요', 'error');
      document.getElementById('app-name').focus();
    }
    return;
  }
  const namespace = document.getElementById('app-namespace').value.trim();

  const envVars = collectEnvVars();
  if (envVars.length === 0 && state.uploadedFiles.length === 0) {
    if (!isSilent) {
      showToast('환경 변수 또는 파일을 하나 이상 추가하세요', 'error');
    }
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('namespace', namespace);
  formData.append('envVars', JSON.stringify(envVars));
  state.uploadedFiles.forEach(f => formData.append('files', f, f.name));

  if (!isSilent) showLoading();
  try {
    const res  = await fetch('/api/configmap', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    displayYaml('configmap', data.yaml);
    markSectionDone('configmap');
    if (!isSilent) showToast('ConfigMap YAML 생성 완료!', 'success');
  } catch (err) {
    showYamlError('configmap', err.message);
    if (!isSilent) showToast('오류: ' + err.message, 'error');
    if (isSilent) throw err;
  } finally {
    if (!isSilent) hideLoading();
  }
}

/* =====================================================
   API: Generate Service
   ===================================================== */
async function generateService(isSilent = false) {
  const name = document.getElementById('app-name').value.trim();
  if (!name) {
    if (!isSilent) {
      showToast('앱 이름을 입력하세요', 'error');
      document.getElementById('app-name').focus();
    }
    return;
  }
  const namespace = document.getElementById('app-namespace').value.trim();

  const servicePort = document.getElementById('svc-service-port').value;
  const targetPort  = document.getElementById('svc-target-port').value;

  if (isSilent && (!servicePort || !targetPort)) {
    // Skip silently in batch mode if ports are not filled
    return;
  }

  const payload = {
    name,
    namespace,
    serviceType: state.serviceType,
    portName:    document.getElementById('svc-port-name').value.trim(),
    servicePort,
    targetPort,
    nodePort:    state.serviceType === 'nodeport' ? document.getElementById('svc-node-port').value : '',
  };

  if (!isSilent) showLoading();
  try {
    const res  = await fetch('/api/service', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    displayYaml('service', data.yaml);
    markSectionDone('service');
    if (!isSilent) showToast('Service YAML 생성 완료!', 'success');
  } catch (err) {
    showYamlError('service', err.message);
    if (!isSilent) showToast('오류: ' + err.message, 'error');
    if (isSilent) throw err;
  } finally {
    if (!isSilent) hideLoading();
  }
}

/* =====================================================
   API: Generate Deployment
   ===================================================== */
async function generateDeployment(isSilent = false) {
  const name = document.getElementById('app-name').value.trim();
  if (!name) {
    if (!isSilent) {
      showToast('앱 이름을 입력하세요', 'error');
      document.getElementById('app-name').focus();
    }
    return;
  }
  const image = document.getElementById('dep-image').value.trim();
  if (!image) {
    if (!isSilent) {
      showToast('컨테이너 이미지를 입력하세요', 'error');
      document.getElementById('dep-image').focus();
    }
    return;
  }
  const namespace = document.getElementById('app-namespace').value.trim();

  const mountItems       = getSelectedMountItems();       // [{key, mountPath}] ConfigMap
  const secretMountItems = getSelectedSecretMountItems(); // [{key, mountPath}] Secret
  const envKeys          = getSelectedEnvKeys();          // [key, ...] ConfigMap
  const secretEnvKeys    = getSelectedSecretEnvKeys();    // [key, ...] Secret
  const customEnvVars    = collectDepCustomEnvVars();     // [{key, value}, ...] Custom
  const manualMounts     = collectManualMounts();         // [{name, type, source, mountPath}, ...]

  const payload = {
    name,
    namespace,
    image,
    replicas:         document.getElementById('dep-replicas').value,
    port:             document.getElementById('dep-port').value,
    configMapName:    name,
    secretName:       name,
    mountItems,
    secretMountItems,
    envKeys,
    secretEnvKeys,
    customEnvVars,
    manualMounts,
  };

  if (!isSilent) showLoading();
  try {
    const res  = await fetch('/api/deployment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    displayYaml('deployment', data.yaml);
    markSectionDone('deployment');
    if (!isSilent) showToast('Deployment YAML 생성 완료!', 'success');
  } catch (err) {
    showYamlError('deployment', err.message);
    if (!isSilent) showToast('오류: ' + err.message, 'error');
    if (isSilent) throw err;
  } finally {
    if (!isSilent) hideLoading();
  }
}

/* =====================================================
   API: Batch Generate All (Generate All Selected)
   ===================================================== */
async function generateAll() {
  const name = document.getElementById('app-name').value.trim();
  if (!name) {
    showToast('앱 이름을 입력하세요', 'error');
    document.getElementById('app-name').focus();
    return;
  }

  showLoading();
  let generatedCount = 0;
  let skippedCount = 0;

  try {
    // 1. Secret
    const secretVars = collectSecretVars();
    if (secretVars.length > 0 || state.secretFiles.length > 0) {
      await generateSecret(true);
      generatedCount++;
    } else {
      skippedCount++;
      state.yamls.secret = null;
      document.getElementById('yaml-card-secret').style.display = 'none';
    }

    // 2. ConfigMap
    const envVars = collectEnvVars();
    if (envVars.length > 0 || state.uploadedFiles.length > 0) {
      await generateConfigMap(true);
      generatedCount++;
    } else {
      skippedCount++;
      state.yamls.configmap = null;
      document.getElementById('yaml-card-configmap').style.display = 'none';
    }

    // 3. Service
    const servicePort = document.getElementById('svc-service-port').value;
    const targetPort  = document.getElementById('svc-target-port').value;
    if (servicePort && targetPort) {
      await generateService(true);
      generatedCount++;
    } else {
      skippedCount++;
      state.yamls.service = null;
      document.getElementById('yaml-card-service').style.display = 'none';
    }

    // 4. Deployment
    const image = document.getElementById('dep-image').value.trim();
    if (image) {
      await generateDeployment(true);
      generatedCount++;
    } else {
      skippedCount++;
      state.yamls.deployment = null;
      document.getElementById('yaml-card-deployment').style.display = 'none';
    }

    updateActionButtons();

    if (generatedCount > 0) {
      showToast(`일괄 생성 완료! (${generatedCount}개 생성, ${skippedCount}개 생략)`, 'success');
    } else {
      showToast('생성할 설정이 없습니다. 각 섹션에 값을 입력해 주세요.', 'warning');
      document.getElementById('output-empty').style.display = '';
    }
  } catch (err) {
    showToast('일괄 생성 중 오류가 발생했습니다: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* =====================================================
   YAML Display
   ===================================================== */
function displayYaml(type, yamlText) {
  state.yamls[type] = yamlText;

  const card   = document.getElementById(`yaml-card-${type}`);
  const codeEl = document.getElementById(`yaml-output-${type}`);

  const prevErr = card.querySelector('.error-card');
  if (prevErr) prevErr.remove();
  card.querySelector('pre').style.display = '';

  // Reset className to ensure highlight.js re-highlights the content correctly
  codeEl.className = 'language-yaml';
  codeEl.textContent = yamlText;
  hljs.highlightElement(codeEl);
  card.style.display = '';

  document.getElementById('output-empty').style.display = 'none';
  updateActionButtons();
}

function showYamlError(type, message) {
  const card   = document.getElementById(`yaml-card-${type}`);
  const preEl  = card.querySelector('pre');

  card.style.display = '';
  preEl.style.display = 'none';

  let errorDiv = card.querySelector('.error-card');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'error-card';
    preEl.after(errorDiv);
  }
  errorDiv.textContent = '❌ 오류:\n' + message;

  document.getElementById('output-empty').style.display = 'none';
}

/* =====================================================
   Copy & Download
   ===================================================== */
function copySingle(type) {
  const yaml = state.yamls[type];
  if (!yaml) return;
  navigator.clipboard.writeText(yaml).then(() =>
    showToast(`${typeLabel(type)} YAML 복사 완료`, 'success')
  );
}

function copyAll() {
  const combined = buildCombined();
  if (!combined) return;
  navigator.clipboard.writeText(combined).then(() =>
    showToast('전체 YAML 복사 완료', 'success')
  );
}

function downloadAll() {
  const combined = buildCombined();
  if (!combined) return;
  const blob = new Blob([combined], { type: 'text/yaml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'k8s-manifests.yaml';
  a.click();
  URL.revokeObjectURL(url);
  showToast('k8s-manifests.yaml 다운로드 시작', 'info');
}

function buildCombined() {
  return [state.yamls.secret, state.yamls.configmap, state.yamls.service, state.yamls.deployment]
    .filter(Boolean)
    .map(y => y.trim())
    .join('\n---\n');
}

function updateActionButtons() {
  const hasAny = Object.values(state.yamls).some(v => v !== null);
  document.getElementById('btn-copy-all').disabled     = !hasAny;
  document.getElementById('btn-download-all').disabled = !hasAny;
}

function typeLabel(type) {
  return { secret: 'Secret', configmap: 'ConfigMap', service: 'Service', deployment: 'Deployment' }[type] || type;
}

/* =====================================================
   Loading & Toast
   ==================================================== */
function showLoading() { document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading()  { document.getElementById('loading-overlay').classList.remove('show'); }

let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* =====================================================
   Utilities
   ===================================================== */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* =====================================================
   Theme Mode Manager
   ===================================================== */
function setThemeMode(mode) {
  // Set data-theme attribute on <html> element
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('theme', mode);

  // Sync active switcher button state
  ['system', 'light', 'dark'].forEach(m => {
    const btn = document.getElementById(`theme-btn-${m}`);
    if (btn) {
      btn.classList.toggle('active', m === mode);
    }
  });
}

function restoreTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  setThemeMode(saved);
}

// Immediate execution to prevent flash of unstyled theme
(function() {
  const saved = localStorage.getItem('theme') || 'system';
  document.documentElement.setAttribute('data-theme', saved);
})();

/* =====================================================
   Deployment — Manual Volume Mounts
   ===================================================== */
function addManualMount(name = '', type = 'hostPath', source = '', mountPath = '') {
  state.manualMountCount++;
  const id = state.manualMountCount;

  const row = document.createElement('div');
  row.className = 'manual-mount-row';
  row.id = `manual-mount-row-${id}`;
  row.style.marginTop = '0.5rem';
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="볼륨명 (예: data-vol)"
           id="manual-vol-name-${id}" value="${escapeHtml(name)}" aria-label="수동 볼륨 이름">
    <select class="form-input" id="manual-vol-type-${id}"
            onchange="toggleManualVolSource(${id})" aria-label="수동 볼륨 타입">
      <option value="hostPath" ${type === 'hostPath' ? 'selected' : ''}>hostPath</option>
      <option value="emptyDir" ${type === 'emptyDir' ? 'selected' : ''}>emptyDir</option>
      <option value="pvc" ${type === 'pvc' ? 'selected' : ''}>PVC</option>
    </select>
    <input type="text" class="form-input" placeholder="호스트 경로 (예: /var/data)"
           id="manual-vol-source-${id}" value="${escapeHtml(source)}" aria-label="수동 볼륨 소스" ${type === 'emptyDir' ? 'disabled' : ''}>
    <input type="text" class="form-input" placeholder="마운트 경로 (예: /data)"
           id="manual-vol-path-${id}" value="${escapeHtml(mountPath)}" aria-label="수동 볼륨 마운트 경로">
    <button class="btn-remove" onclick="removeManualMount(${id})" aria-label="수동 볼륨 삭제">✕</button>
  `;

  document.getElementById('manual-mounts-container').appendChild(row);
  document.getElementById('manual-mounts-empty').style.display = 'none';
  if (!name) {
    document.getElementById(`manual-vol-name-${id}`).focus();
  }
  toggleManualVolSource(id);
}

function removeManualMount(id) {
  const row = document.getElementById(`manual-mount-row-${id}`);
  if (row) row.remove();
  if (document.querySelectorAll('#manual-mounts-container .manual-mount-row').length === 0) {
    document.getElementById('manual-mounts-empty').style.display = '';
  }
}

function toggleManualVolSource(id) {
  const typeEl = document.getElementById(`manual-vol-type-${id}`);
  const srcEl = document.getElementById(`manual-vol-source-${id}`);
  if (!typeEl || !srcEl) return;

  const type = typeEl.value;
  if (type === 'emptyDir') {
    srcEl.value = '';
    srcEl.placeholder = '(emptyDir은 소스 생략)';
    srcEl.disabled = true;
  } else if (type === 'pvc') {
    srcEl.placeholder = 'PVC 이름 (예: my-pvc)';
    srcEl.disabled = false;
  } else {
    srcEl.placeholder = '호스트 경로 (예: /var/data)';
    srcEl.disabled = false;
  }
}

function collectManualMounts() {
  return Array.from(document.querySelectorAll('#manual-mounts-container .manual-mount-row')).map(row => {
    const id = row.id.replace('manual-mount-row-', '');
    const name = (document.getElementById(`manual-vol-name-${id}`) || {}).value?.trim() || '';
    const type = (document.getElementById(`manual-vol-type-${id}`) || {}).value || 'hostPath';
    const source = (document.getElementById(`manual-vol-source-${id}`) || {}).value?.trim() || '';
    const mountPath = (document.getElementById(`manual-vol-path-${id}`) || {}).value?.trim() || '';
    return { name, type, source, mountPath };
  }).filter(m => m.name !== '' && m.mountPath !== '');
}

/* =====================================================
   Preset Export & Import
   ===================================================== */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

async function exportPreset() {
  showLoading();
  try {
    // Read secret files as base64 URLs
    const secretFilesData = await Promise.all(state.secretFiles.map(async f => {
      try {
        const dataUrl = await readFileAsDataURL(f);
        return { name: f.name, size: f.size, dataUrl };
      } catch (err) {
        console.error('Secret 파일 읽기 실패:', f.name, err);
        return { name: f.name, size: f.size, dataUrl: null };
      }
    }));

    // Read configmap files as base64 URLs
    const configMapFilesData = await Promise.all(state.uploadedFiles.map(async f => {
      try {
        const dataUrl = await readFileAsDataURL(f);
        return { name: f.name, size: f.size, dataUrl };
      } catch (err) {
        console.error('ConfigMap 파일 읽기 실패:', f.name, err);
        return { name: f.name, size: f.size, dataUrl: null };
      }
    }));

    const preset = {
      appName:          document.getElementById('app-name').value.trim(),
      appNamespace:     document.getElementById('app-namespace').value.trim(),
      
      // Secret
      secretVars:       collectSecretVars(),
      secretFiles:      secretFilesData,
      
      // ConfigMap
      configMapVars:    collectEnvVars(),
      configMapFiles:   configMapFilesData,
      
      // Service
      serviceType:      state.serviceType,
      svcPortName:      document.getElementById('svc-port-name').value.trim(),
      svcServicePort:   document.getElementById('svc-service-port').value,
      svcTargetPort:    document.getElementById('svc-target-port').value,
      svcNodePort:      document.getElementById('svc-node-port').value,
      
      // Deployment
      depImage:         document.getElementById('dep-image').value.trim(),
      depReplicas:      document.getElementById('dep-replicas').value,
      depPort:          document.getElementById('dep-port').value,
      depCustomEnvVars: collectDepCustomEnvVars(),
      depManualMounts:  collectManualMounts(),
      
      // Deployment Checkbox States & Bindings
      checkedSecretEnvKeys:    getSelectedSecretEnvKeys(),
      checkedConfigMapEnvKeys: getSelectedEnvKeys(),
      secretMountPaths:        Array.from(document.querySelectorAll('#secret-mount-items-container .mount-item-row[data-key]')).map(row => ({
        key:       row.dataset.key,
        checked:   row.querySelector('.mount-checkbox')?.checked ?? true,
        mountPath: row.querySelector('.mount-path-input')?.value ?? '',
      })),
      configMapMountPaths:     Array.from(document.querySelectorAll('#mount-items-container .mount-item-row[data-key]')).map(row => ({
        key:       row.dataset.key,
        checked:   row.querySelector('.mount-checkbox')?.checked ?? true,
        mountPath: row.querySelector('.mount-path-input')?.value ?? '',
      })),
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(preset, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", `${preset.appName || 'k8s'}-generator-preset.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('설정 프리셋 내보내기 완료!', 'success');
  } catch (err) {
    showToast('프리셋 내보내기 실패: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function importPreset(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      // 1. App Name & Namespace
      document.getElementById('app-name').value = data.appName || '';
      document.getElementById('app-namespace').value = data.appNamespace || '';

      // 2. Secret Data (Vars)
      const secretVarsContainer = document.getElementById('secret-vars-container');
      secretVarsContainer.innerHTML = '';
      document.getElementById('secret-vars-empty').style.display = '';
      if (Array.isArray(data.secretVars)) {
        data.secretVars.forEach(ev => addSecretVar(ev.key, ev.value));
      }

      // 3. Secret Files (Restore content if dataUrl exists)
      state.secretFiles = [];
      if (Array.isArray(data.secretFiles)) {
        data.secretFiles.forEach(f => {
          if (f.dataUrl) {
            try {
              state.secretFiles.push(dataURLtoFile(f.dataUrl, f.name));
            } catch (err) {
              console.error('Secret 파일 복원 실패:', f.name, err);
              state.secretFiles.push(new File([], f.name));
            }
          } else {
            state.secretFiles.push(new File([], f.name));
          }
        });
      }
      renderSecretFileList();

      // 4. ConfigMap Data (Vars)
      const envVarsContainer = document.getElementById('env-vars-container');
      envVarsContainer.innerHTML = '';
      document.getElementById('env-vars-empty').style.display = '';
      if (Array.isArray(data.configMapVars)) {
        data.configMapVars.forEach(ev => addEnvVar(ev.key, ev.value));
      }

      // 5. ConfigMap Files (Restore content if dataUrl exists)
      state.uploadedFiles = [];
      if (Array.isArray(data.configMapFiles)) {
        data.configMapFiles.forEach(f => {
          if (f.dataUrl) {
            try {
              state.uploadedFiles.push(dataURLtoFile(f.dataUrl, f.name));
            } catch (err) {
              console.error('ConfigMap 파일 복원 실패:', f.name, err);
              state.uploadedFiles.push(new File([], f.name));
            }
          } else {
            state.uploadedFiles.push(new File([], f.name));
          }
        });
      }
      renderFileList();

      // 6. Service Settings
      selectServiceType(data.serviceType || 'clusterip');
      document.getElementById('svc-port-name').value = data.svcPortName || '';
      document.getElementById('svc-service-port').value = data.svcServicePort || '';
      document.getElementById('svc-target-port').value = data.svcTargetPort || '';
      document.getElementById('svc-node-port').value = data.svcNodePort || '';

      // 7. Deployment Base
      document.getElementById('dep-image').value = data.depImage || '';
      document.getElementById('dep-replicas').value = data.depReplicas || '1';
      document.getElementById('dep-port').value = data.depPort || '';

      // 8. Deployment Custom Env Vars
      const customEnvContainer = document.getElementById('dep-custom-env-container');
      customEnvContainer.innerHTML = '';
      document.getElementById('dep-custom-env-empty').style.display = '';
      if (Array.isArray(data.depCustomEnvVars)) {
        data.depCustomEnvVars.forEach(ev => addDepCustomEnvVar(ev.key, ev.value));
      }

      // 9. Deployment Manual Mounts
      const manualMountsContainer = document.getElementById('manual-mounts-container');
      manualMountsContainer.innerHTML = '';
      document.getElementById('manual-mounts-empty').style.display = '';
      if (Array.isArray(data.depManualMounts)) {
        data.depManualMounts.forEach(mm => addManualMount(mm.name, mm.type, mm.source, mm.mountPath));
      }

      // 10. Update bindings & checkboxes inside Deployment
      updateSecretMountItemsUI();
      updateMountItemsUI();
      updateSecretEnvInjectUI();
      updateEnvInjectUI();

      // 11. Restore checked states & path inputs for Secret Mounts
      if (Array.isArray(data.secretMountPaths)) {
        data.secretMountPaths.forEach(mp => {
          const row = document.querySelector(`#secret-mount-items-container .mount-item-row[data-key="${mp.key}"]`);
          if (row) {
            const cb = row.querySelector('.mount-checkbox');
            if (cb) cb.checked = mp.checked;
            const pathInput = row.querySelector('.mount-path-input');
            if (pathInput) pathInput.value = mp.mountPath;
          }
        });
      }

      // 12. Restore checked states & path inputs for ConfigMap Mounts
      if (Array.isArray(data.configMapMountPaths)) {
        data.configMapMountPaths.forEach(mp => {
          const row = document.querySelector(`#mount-items-container .mount-item-row[data-key="${mp.key}"]`);
          if (row) {
            const cb = row.querySelector('.mount-checkbox');
            if (cb) cb.checked = mp.checked;
            const pathInput = row.querySelector('.mount-path-input');
            if (pathInput) pathInput.value = mp.mountPath;
          }
        });
      }

      // 13. Restore checked states for Secret Environment Keys
      if (Array.isArray(data.checkedSecretEnvKeys)) {
        const checkedSet = new Set(data.checkedSecretEnvKeys);
        document.querySelectorAll('#secret-env-inject-container .secret-env-inject-cb').forEach(cb => {
          cb.checked = checkedSet.has(cb.dataset.key);
        });
      }

      // 14. Restore checked states for ConfigMap Environment Keys
      if (Array.isArray(data.checkedConfigMapEnvKeys)) {
        const checkedSet = new Set(data.checkedConfigMapEnvKeys);
        document.querySelectorAll('#env-inject-container .env-inject-cb').forEach(cb => {
          cb.checked = checkedSet.has(cb.dataset.key);
        });
      }

      showToast('설정 프리셋 불러오기 완료!', 'success');
    } catch (err) {
      showToast('불러오기 실패: 올바르지 않은 프리셋 형식입니다.', 'error');
      console.error(err);
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // reset file input
}
