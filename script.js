// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbzgcibH369NS25K6afIYWfspNev0OcaXkRl2C2_HsmNGvdMTTK0OO4cn0VqmaC70GLGfg/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let currentTab = 'local';
let currentProduct = null;

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    // Configurar eventos
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    // Configurar botão de salvar edição
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedProduct);
    
    // Verificar status da API
    checkAPIStatus();
    
    // Exemplo: Adicionar alguns produtos iniciais se banco estiver vazio
    setTimeout(checkEmptyDatabase, 2000);
});

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera traseira...', 'scanning');
        
        document.getElementById('cameraInfo').classList.remove('hidden');
        document.getElementById('startBtn').classList.add('hidden');
        document.getElementById('cameraControls').classList.remove('hidden');
        document.getElementById('scannerContainer').style.display = 'block';
        
        const config = {
            fps: 30,
            qrbox: { width: 300, height: 200 },
            aspectRatio: 4/3,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };
        
        html5QrCode = new Html5Qrcode("reader");
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            currentCameraId = rearCameraId;
            
            const cameraConfig = {
                ...config,
                videoConstraints: {
                    deviceId: { exact: rearCameraId },
                    width: { min: 1280, ideal: 1920, max: 2560 },
                    height: { min: 720, ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30, min: 24 },
                    advanced: [
                        { focusMode: "continuous" },
                        { whiteBalanceMode: "continuous" }
                    ]
                }
            };
            
            await html5QrCode.start(
                rearCameraId,
                cameraConfig,
                onScanSuccess,
                onScanError
            );
            
        } else {
            const fallbackConfig = {
                ...config,
                videoConstraints: {
                    facingMode: { exact: "environment" },
                    width: { min: 1280, ideal: 1920 },
                    height: { min: 720, ideal: 1080 },
                    frameRate: { ideal: 30 },
                    advanced: [{ focusMode: "continuous" }]
                }
            };
            
            await html5QrCode.start(
                { facingMode: "environment" },
                fallbackConfig,
                onScanSuccess,
                onScanError
            );
            
            currentCameraId = "environment";
        }
        
        updateStatus('Scanner ativo com auto-foco! Aponte para um código...', 'success');
        isScanning = true;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

async function findRearCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const exactCamera = videoDevices.find(device => 
            device.label && device.label.includes("camera 0, facing back")
        );
        
        if (exactCamera) return exactCamera.deviceId;
        
        const rearCamera = videoDevices.find(device => {
            if (!device.label) return false;
            const label = device.label.toLowerCase();
            return REAR_CAMERA_KEYWORDS.some(keyword => 
                label.includes(keyword.toLowerCase())
            );
        });
        
        if (rearCamera) return rearCamera.deviceId;
        
        if (videoDevices.length > 0) return videoDevices[0].deviceId;
        
        return null;
        
    } catch (error) {
        console.error("Erro ao encontrar câmera:", error);
        return null;
    }
}

async function handleScannerError(error) {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (e) {}
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    if (error.message.includes('permission')) {
        updateStatus('Permissão da câmera negada. Permita o acesso à câmera.', 'error');
    } else if (error.message.includes('NotFoundError')) {
        updateStatus('Câmera traseira não disponível.', 'error');
    } else if (error.message.includes('NotSupportedError')) {
        updateStatus('Tentando modo padrão...', 'warning');
        setTimeout(() => initScannerWithoutAdvanced(), 1000);
        return;
    } else {
        updateStatus('Erro ao iniciar o scanner. Tente novamente.', 'error');
    }
    
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('cameraControls').classList.add('hidden');
    document.getElementById('cameraInfo').classList.add('hidden');
    document.getElementById('scannerContainer').style.display = 'none';
}

async function initScannerWithoutAdvanced() {
    try {
        updateStatus('Iniciando modo padrão...', 'scanning');
        
        const basicConfig = {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128
            ]
        };
        
        await html5QrCode.start(
            { facingMode: "environment" },
            basicConfig,
            onScanSuccess,
            onScanError
        );
        
        updateStatus('Scanner ativo (modo padrão)!', 'success');
        isScanning = true;
        currentCameraId = "environment";
        
    } catch (error) {
        updateStatus('Falha ao iniciar scanner.', 'error');
        document.getElementById('startBtn').classList.remove('hidden');
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`Código detectado: ${code}`, 'success');
    
    if (html5QrCode) html5QrCode.pause();
    searchProduct(code);
    
    setTimeout(() => {
        if (html5QrCode && isScanning) {
            html5QrCode.resume();
            updateStatus('Pronto para escanear novamente...', 'scanning');
        }
    }, 3000);
}

function onScanError(error) {
    if (!error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

function isValidBarcode(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length < 8 || code.length > 13) return false;
    if (code.length === 13) return validateEAN13(code);
    return true;
}

function validateEAN13(code) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(code[12]);
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
        } catch (error) {}
        html5QrCode.clear();
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    document.getElementById('scannerContainer').style.display = 'none';
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('cameraControls').classList.add('hidden');
    document.getElementById('cameraInfo').classList.add('hidden');
    
    updateStatus('Scanner parado. Clique para iniciar novamente.', 'default');
}

// ========== SISTEMA DE TABS ==========
function switchTab(tabName) {
    currentTab = tabName;
    
    // Atualizar tabs visuais
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Buscar último código se existir
    const lastCode = document.getElementById('manualCode').value;
    if (lastCode && lastCode.length >= 8) {
        searchProduct(lastCode);
    }
}

// ========== BUSCA PRINCIPAL ==========
async function searchProduct(code) {
    clearResult();
    
    if (currentTab === 'local') {
        await searchLocalDatabase(code);
    } else {
        await searchExternalAPIs(code);
    }
}

function searchManual() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code || code.length < 8) {
        showAlert('Digite um código de barras válido (8-13 dígitos)', 'warning');
        return;
    }
    searchProduct(code);
}

// ========== BANCO LOCAL (GOOGLE SHEETS) ==========
async function searchLocalDatabase(code) {
    updateStatus(`Buscando código ${code} no banco local...`, 'scanning');
    
    try {
        const localResult = await searchInGoogleSheets(code);
        
        if (localResult && localResult.success && localResult.found) {
            currentProduct = localResult.product;
            showProductInfo(localResult.product, 'Google Sheets', true);
            updateStatus(`Encontrado no banco local (linha ${localResult.product.linha})`, 'success');
            return;
        }
        
        // Não encontrado localmente
        updateStatus('Não encontrado no banco local', 'warning');
        showAddToDatabaseForm(code);
        
    } catch (error) {
        console.error('Erro na busca local:', error);
        updateStatus('Erro ao consultar banco local', 'error');
        showErrorResult('Erro de conexão', 'Não foi possível acessar o banco local.');
    }
}

async function searchInGoogleSheets(ean) {
    if (!GOOGLE_SHEETS_API || GOOGLE_SHEETS_API.includes("SUA_URL_DO_GOOGLE_APPS_SCRIPT")) {
        showAlert('Configure a URL do Google Sheets API primeiro!', 'error');
        return null;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=search&ean=${encodeURIComponent(ean)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar no Google Sheets:', error);
        return null;
    }
}

async function saveToGoogleSheets(productData) {
    try {
        const params = new URLSearchParams({
            operation: 'save',
            ean: productData.ean,
            nome: productData.nome || '',
            marca: productData.marca || '',
            imagem: productData.imagem || '',
            preco: productData.preco || '',
            fonte: productData.fonte || 'Manual'
        });
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao salvar no Google Sheets:', error);
        return { success: false, error: error.message };
    }
}

async function updateInGoogleSheets(productData) {
    try {
        const params = new URLSearchParams({
            operation: 'update',
            ean: productData.ean,
            nome: productData.nome || '',
            marca: productData.marca || '',
            imagem: productData.imagem || '',
            preco: productData.preco || '',
            fonte: productData.fonte || 'Editado'
        });
        
        if (productData.linha) {
            params.append('linha', productData.linha);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Erro ao atualizar:', error);
        return { success: false, error: error.message };
    }
}

async function deleteFromGoogleSheets(ean, linha) {
    try {
        const params = new URLSearchParams({
            operation: 'delete',
            ean: ean
        });
        
        if (linha) {
            params.append('linha', linha);
        }
        
        const url = `${GOOGLE_SHEETS_API}?${params.toString()}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        return { success: false, error: error.message };
    }
}

// ========== APIS EXTERNAS ==========
async function searchExternalAPIs(code) {
    updateStatus('Buscando em APIs externas...', 'scanning');
    
    const apis = [
        { name: "Open Food Facts", func: searchOpenFoodFacts, icon: "fas fa-apple-alt" },
        { name: "EAN Search", func: searchEanSearch, icon: "fas fa-search" },
        { name: "Bluesoft Cosmos", func: searchBluesoftCosmos, icon: "fas fa-star" }
    ];
    
    // Mostrar indicador de busca
    showLoadingResult('Consultando múltiplas fontes...');
    
    let foundProduct = null;
    let foundSource = '';
    
    for (const api of apis) {
        try {
            updateStatus(`Consultando ${api.name}...`, 'scanning');
            
            const product = await api.func(code);
            if (product && product.name) {
                foundProduct = product;
                foundSource = api.name;
                break;
            }
        } catch (error) {
            console.log(`API ${api.name} falhou:`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (foundProduct) {
        showExternalProductInfo(foundProduct, code, foundSource);
        updateStatus(`Encontrado em: ${foundSource}`, 'success');
    } else {
        showNoExternalResults(code);
        updateStatus('Não encontrado em APIs externas', 'warning');
    }
}

async function searchOpenFoodFacts(code) {
    try {
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        
        const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.status === 1 && data.product) {
            return {
                name: data.product.product_name || 
                      data.product.product_name_pt || 
                      data.product.product_name_en || 
                      'Produto',
                brand: data.product.brands || '',
                image: data.product.image_front_url || data.product.image_url || null,
                price: ''
            };
        }
        return null;
    } catch { return null; }
}

async function searchEanSearch(code) {
    try {
        const response = await fetch(`https://api.ean-search.org/api?token=demo&op=barcode-lookup&format=json&ean=${code}`);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data && data.length > 0 && data[0].name) {
            return {
                name: data[0].name,
                brand: data[0].vendor || data[0].manufacturer || '',
                image: null,
                price: ''
            };
        }
        return null;
    } catch { return null; }
}

async function searchBluesoftCosmos(code) {
    try {
        const response = await fetch(
            `https://api.cosmos.bluesoft.com.br/gtins/${code}.json`,
            {
                headers: {
                    'X-Cosmos-Token': BLUESOFT_API_KEY,
                    'User-Agent': 'Cosmos-API-Request',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        return {
            name: data.description || 'Produto',
            brand: data.brand?.name || '',
            image: data.thumbnail || null,
            price: data.price || ''
        };
        
    } catch { return null; }
}

// ========== RENDERIZAÇÃO DE RESULTADOS ==========
function showProductInfo(product, source, isFromDatabase = true) {
    const resultDiv = document.getElementById('result');
    
    let imageHtml = '';
    if (product.imagem) {
        imageHtml = `
            <div class="product-image-container">
                <img src="${product.imagem}" 
                     class="product-image" 
                     alt="${product.nome}"
                     onerror="handleImageError(this)">
            </div>
        `;
    } else {
        imageHtml = `
            <div class="product-image-container">
                <div class="no-image">
                    <i class="fas fa-image"></i>
                    <span>Sem imagem disponível</span>
                </div>
            </div>
        `;
    }
    
    let sourceBadge = source;
    if (isFromDatabase) {
        sourceBadge += ' <span class="db-badge">BANCO LOCAL</span>';
    }
    
    let priceHtml = '';
    if (product.preco) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i>
                R$ ${product.preco}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> ${product.ean}
                </div>
                
                <div class="product-title">${product.nome}</div>
                
                ${product.marca ? `
                <div class="product-brand">
                    <i class="fas fa-industry"></i> ${product.marca}
                </div>
                ` : ''}
                
                ${priceHtml}
                
                ${product.cadastro ? `
                <div class="product-meta">
                    <div><i class="fas fa-calendar-plus"></i> Cadastro: ${product.cadastro}</div>
                    ${product.ultima_consulta ? `
                    <div><i class="fas fa-history"></i> Última consulta: ${product.ultima_consulta}</div>
                    ` : ''}
                </div>
                ` : ''}
                
                <div class="source-badge">
                    <i class="fas fa-database"></i> ${sourceBadge}
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                <i class="fas fa-trash"></i> Excluir
            </button>
            <button class="btn" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">
                <i class="fas fa-globe"></i> Pesquisar Online
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showExternalProductInfo(product, code, source) {
    const resultDiv = document.getElementById('result');
    
    let imageHtml = '';
    if (product.image) {
        imageHtml = `
            <div class="product-image-container">
                <img src="${product.image}" 
                     class="product-image" 
                     alt="${product.name}"
                     onerror="handleImageError(this)">
            </div>
        `;
    } else {
        imageHtml = `
            <div class="product-image-container">
                <div class="no-image">
                    <i class="fas fa-image"></i>
                    <span>Sem imagem disponível</span>
                </div>
            </div>
        `;
    }
    
    let priceHtml = '';
    if (product.price) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i>
                ${product.price}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> ${code}
                </div>
                
                <div class="product-title">${product.name}</div>
                
                ${product.brand ? `
                <div class="product-brand">
                    <i class="fas fa-industry"></i> ${product.brand}
                </div>
                ` : ''}
                
                ${priceHtml}
                
                <div class="source-badge">
                    <i class="fas fa-external-link-alt"></i> Fonte: ${source} <span class="db-missing">EXTERNA</span>
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-save"></i> Salvar no Banco Local
            </button>
            <button class="btn" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
                <i class="fas fa-globe"></i> Pesquisar Online
            </button>
            <button class="btn btn-secondary" onclick="switchTab('local'); searchLocalDatabase('${code}')">
                <i class="fas fa-database"></i> Verificar no Banco Local
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showAddToDatabaseForm(code) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-plus-circle"></i>
            </div>
            <h3>Produto não encontrado</h3>
            <p>
                Código: <strong>${code}</strong><br>
                Deseja cadastrar manualmente?
            </p>
            
            <div class="edit-form">
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Nome do Produto *</label>
                    <input type="text" id="newNome" placeholder="Ex: Leite Integral 1L" required>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-industry"></i> Marca</label>
                    <input type="text" id="newMarca" placeholder="Ex: Itambé">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-image"></i> URL da Imagem</label>
                    <input type="text" id="newImagem" placeholder="https://exemplo.com/imagem.jpg">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-money-bill-wave"></i> Preço (R$)</label>
                    <input type="text" id="newPreco" placeholder="Ex: 6.90">
                </div>
                
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="saveNewProduct('${code}')">
                        <i class="fas fa-save"></i> Salvar no Banco
                    </button>
                    <button class="btn btn-info" onclick="switchTab('external'); searchExternalAPIs('${code}')">
                        <i class="fas fa-search"></i> Buscar em APIs Externas
                    </button>
                </div>
            </div>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showNoExternalResults(code) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-search"></i>
            </div>
            <h3>Não encontrado</h3>
            <p>
                Código: <strong>${code}</strong><br>
                Não encontrado nas APIs externas consultadas.
            </p>
            
            <div class="search-sources">
                <button class="btn btn-info" onclick="searchOpenFoodFactsManual('${code}')">
                    <i class="fas fa-apple-alt"></i> Open Food Facts
                </button>
                <button class="btn btn-info" onclick="searchEanSearchManual('${code}')">
                    <i class="fas fa-search"></i> EAN Search
                </button>
                <button class="btn btn-info" onclick="searchBluesoftManual('${code}')">
                    <i class="fas fa-star"></i> Bluesoft
                </button>
            </div>
            
            <div class="action-buttons">
                <button class="btn btn-success" onclick="addManualProduct('${code}')">
                    <i class="fas fa-plus-circle"></i> Cadastrar Manualmente
                </button>
                <button class="btn" onclick="searchOnline('${code}')">
                    <i class="fas fa-globe"></i> Pesquisar na Web
                </button>
            </div>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showLoadingResult(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="loading" style="margin: 20px auto;"></div>
            <p>${message}</p>
        </div>
    `;
    resultDiv.classList.add('active');
}

function showErrorResult(title, message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>${title}</h3>
            <p>${message}</p>
            <button class="btn" onclick="searchManual()" style="margin-top: 20px;">
                <i class="fas fa-redo"></i> Tentar novamente
            </button>
        </div>
    `;
    resultDiv.classList.add('active');
}

function clearResult() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
    resultDiv.classList.remove('active');
}

// ========== MODAL FUNCTIONS ==========
function openEditModal(ean, nome, marca, imagem, preco, linha) {
    currentProduct = { ean, linha };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    document.getElementById('editModal').classList.add('active');
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
    currentProduct = null;
}

async function saveEditedProduct() {
    const nome = document.getElementById('editNome').value.trim();
    const marca = document.getElementById('editMarca').value.trim();
    const imagem = document.getElementById('editImagem').value.trim();
    const preco = document.getElementById('editPreco').value.trim();
    
    if (!nome) {
        showAlert('Por favor, informe o nome do produto', 'warning');
        return;
    }
    
    if (!currentProduct) return;
    
    const productData = {
        ean: currentProduct.ean,
        linha: currentProduct.linha,
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: 'Editado'
    };
    
    updateStatus('Atualizando produto...', 'scanning');
    
    const result = await updateInGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('Produto atualizado com sucesso!', 'success');
        closeModal();
        setTimeout(() => searchLocalDatabase(currentProduct.ean), 1000);
    } else {
        updateStatus(`Erro ao atualizar: ${result.error || result.message}`, 'error');
    }
}

// ========== CRUD FUNCTIONS ==========
async function saveNewProduct(code) {
    const nome = document.getElementById('newNome').value.trim();
    const marca = document.getElementById('newMarca').value.trim();
    const imagem = document.getElementById('newImagem').value.trim();
    const preco = document.getElementById('newPreco').value.trim();
    
    if (!nome) {
        showAlert('Por favor, informe o nome do produto', 'warning');
        return;
    }
    
    const productData = {
        ean: code,
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: 'Manual'
    };
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('Produto salvo no banco local!', 'success');
        setTimeout(() => searchLocalDatabase(code), 1000);
    } else {
        updateStatus(`Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function saveExternalProductToDatabase(code, name, brand, image, price, source) {
    const productData = {
        ean: code,
        nome: decodeURIComponent(name),
        marca: decodeURIComponent(brand),
        imagem: decodeURIComponent(image),
        preco: decodeURIComponent(price),
        fonte: source
    };
    
    updateStatus('Salvando no banco local...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('Produto salvo no banco local!', 'success');
        setTimeout(() => {
            switchTab('local');
            searchLocalDatabase(code);
        }, 1000);
    } else {
        updateStatus(`Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function deleteProduct(ean, linha) {
    if (!confirm(`Tem certeza que deseja excluir o produto ${ean}?`)) {
        return;
    }
    
    updateStatus('Excluindo produto...', 'scanning');
    
    const result = await deleteFromGoogleSheets(ean, linha);
    
    if (result.success) {
        updateStatus('Produto excluído do banco local!', 'success');
        
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-trash"></i>
                </div>
                <h3>Produto excluído</h3>
                <p>
                    Código: <strong>${ean}</strong><br>
                    O produto foi removido do banco local.
                </p>
            </div>
        `;
    } else {
        updateStatus(`Erro ao excluir: ${result.error || result.message}`, 'error');
    }
}

// ========== HELPER FUNCTIONS ==========
function searchOnline(code, name = '') {
    const query = name ? `${decodeURIComponent(name)} ${code}` : `EAN ${code}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`, '_blank');
}

async function searchOpenFoodFactsManual(code) {
    updateStatus('Consultando Open Food Facts...', 'scanning');
    
    const product = await searchOpenFoodFacts(code);
    if (product) {
        showExternalProductInfo(product, code, 'Open Food Facts');
        updateStatus('Encontrado no Open Food Facts', 'success');
    } else {
        updateStatus('Não encontrado no Open Food Facts', 'warning');
    }
}

async function searchEanSearchManual(code) {
    updateStatus('Consultando EAN Search...', 'scanning');
    
    const product = await searchEanSearch(code);
    if (product) {
        showExternalProductInfo(product, code, 'EAN Search');
        updateStatus('Encontrado no EAN Search', 'success');
    } else {
        updateStatus('Não encontrado no EAN Search', 'warning');
    }
}

async function searchBluesoftManual(code) {
    updateStatus('Consultando Bluesoft Cosmos...', 'scanning');
    
    const product = await searchBluesoftCosmos(code);
    if (product) {
        showExternalProductInfo(product, code, 'Bluesoft Cosmos');
        updateStatus('Encontrado no Bluesoft Cosmos', 'success');
    } else {
        updateStatus('Não encontrado no Bluesoft Cosmos', 'warning');
    }
}

function addManualProduct(code) {
    const name = prompt('Digite o nome do produto:', '');
    if (name) {
        const brand = prompt('Digite a marca (opcional):', '');
        const image = prompt('Digite a URL da imagem (opcional):', '');
        const price = prompt('Digite o preço (opcional):', '');
        
        const productData = {
            ean: code,
            nome: name,
            marca: brand || '',
            imagem: image || '',
            preco: price || '',
            fonte: 'Manual'
        };
        
        saveExternalProductToDatabase(code, name, brand || '', image || '', price || '', 'Manual');
    }
}

function handleImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="no-image">
            <i class="fas fa-image"></i>
            <span>Imagem não carregada</span>
        </div>
    `;
}

function updateStatus(message, type = 'default') {
    const statusDiv = document.getElementById('status');
    const icon = getStatusIcon(type);
    
    statusDiv.innerHTML = `${icon} ${message}`;
    statusDiv.className = `status ${type}`;
}

function getStatusIcon(type) {
    switch(type) {
        case 'success': return '<i class="fas fa-check-circle"></i>';
        case 'error': return '<i class="fas fa-times-circle"></i>';
        case 'warning': return '<i class="fas fa-exclamation-triangle"></i>';
        case 'scanning': return '<div class="loading"></div>';
        default: return '<i class="fas fa-info-circle"></i>';
    }
}

function showAlert(message, type = 'info') {
    alert(`[${type.toUpperCase()}] ${message}`);
}

function checkAPIStatus() {
    const apiStatus = document.getElementById('apiStatus');
    if (!GOOGLE_SHEETS_API || GOOGLE_SHEETS_API.includes("SUA_URL_DO_GOOGLE_APPS_SCRIPT")) {
        apiStatus.textContent = "Não configurado";
        apiStatus.style.color = "#ef4444";
        showAlert('Configure a URL do Google Sheets API!', 'warning');
    } else {
        apiStatus.textContent = "Conectado";
        apiStatus.style.color = "#10b981";
    }
}

async function checkEmptyDatabase() {
    // Esta função poderia verificar se o banco está vazio e sugerir adicionar exemplos
    // Implementação opcional para melhoria futura
}

// ========== EXPORT FUNCTIONS TO GLOBAL SCOPE ==========
// Necessário para que as funções sejam acessíveis pelo onclick no HTML
window.searchManual = searchManual;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.switchTab = switchTab;
window.searchOnline = searchOnline;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.saveExternalProductToDatabase = saveExternalProductToDatabase;
window.saveNewProduct = saveNewProduct;
window.searchOpenFoodFactsManual = searchOpenFoodFactsManual;
window.searchEanSearchManual = searchEanSearchManual;
window.searchBluesoftManual = searchBluesoftManual;
window.addManualProduct = addManualProduct;
window.handleImageError = handleImageError;
