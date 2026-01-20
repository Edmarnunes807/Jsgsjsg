// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbzgcibH369NS25K6afIYWfspNev0OcaXkRl2C2_HsmNGvdMTTK0OO4cn0VqmaC70GLGfg/exec";
const BLUESOFT_API_KEY = "7tF33vAL9xZs7ZRoSMBitg";

// ========== VARIÁVEIS GLOBAIS ==========
let html5QrCode = null;
let currentCameraId = null;
let isScanning = false;
let lastScanned = '';
let lastScanTime = 0;
let currentProduct = null;
let currentModalType = 'edit'; // 'edit' ou 'new'

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    // Configurar botão de salvar no modal
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedProduct);
    
    // Verificar status da API
    checkAPIStatus();
    
    // Remover sistema de tabs se existir
    const tabContainers = document.querySelectorAll('.tab-container, .tab');
    if (tabContainers.length > 0) {
        tabContainers.forEach(el => el.style.display = 'none');
    }
});

// ========== FUNÇÕES DO SCANNER ==========
async function initScanner() {
    if (isScanning) return;
    
    try {
        updateStatus('Iniciando câmera...', 'scanning');
        
        // Mostrar interface do scanner
        const scannerContainer = document.getElementById('scannerContainer');
        const startBtn = document.getElementById('startBtn');
        
        if (scannerContainer) scannerContainer.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        
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
        
        // Verificar se a biblioteca está disponível
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca de scanner não carregada');
        }
        
        html5QrCode = new Html5Qrcode("reader");
        
        // Tentar encontrar câmera traseira
        const rearCameraId = await findRearCamera();
        
        if (rearCameraId) {
            currentCameraId = rearCameraId;
            
            const cameraConfig = {
                ...config,
                videoConstraints: {
                    deviceId: { exact: rearCameraId },
                    width: { min: 1280, ideal: 1920, max: 2560 },
                    height: { min: 720, ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30, min: 24 }
                }
            };
            
            await html5QrCode.start(
                rearCameraId,
                cameraConfig,
                onScanSuccess,
                onScanError
            );
            
        } else {
            // Fallback para modo ambiente
            const fallbackConfig = {
                ...config,
                videoConstraints: {
                    facingMode: { exact: "environment" },
                    width: { min: 1280, ideal: 1920 },
                    height: { min: 720, ideal: 1080 }
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
        
        updateStatus('Scanner ativo! Aponte para um código de barras...', 'success');
        isScanning = true;
        
    } catch (error) {
        console.error('Erro ao iniciar scanner:', error);
        await handleScannerError(error);
    }
}

async function findRearCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return null;
        }
        
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
        
        if (videoDevices.length > 1) {
            return videoDevices[videoDevices.length - 1].deviceId;
        }
        
        if (videoDevices.length === 1) {
            return videoDevices[0].deviceId;
        }
        
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
        } catch (e) {
            console.log('Erro ao parar scanner:', e);
        }
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    const startBtn = document.getElementById('startBtn');
    const scannerContainer = document.getElementById('scannerContainer');
    
    if (startBtn) startBtn.style.display = 'inline-block';
    if (scannerContainer) scannerContainer.style.display = 'none';
    
    if (error.message && error.message.includes('permission')) {
        updateStatus('Permissão da câmera negada.', 'error');
    } else if (error.message && error.message.includes('NotFoundError')) {
        updateStatus('Nenhuma câmera encontrada.', 'error');
    } else {
        updateStatus('Erro ao iniciar scanner.', 'error');
    }
}

function onScanError(error) {
    if (!error || typeof error !== 'string' || !error.includes("No MultiFormat Readers")) {
        console.log('Erro de scan:', error);
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
        } catch (error) {
            console.log('Erro ao parar scanner:', error);
        }
        html5QrCode.clear();
    }
    
    isScanning = false;
    html5QrCode = null;
    currentCameraId = null;
    
    const scannerContainer = document.getElementById('scannerContainer');
    const startBtn = document.getElementById('startBtn');
    
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-block';
    
    updateStatus('Scanner parado.', 'default');
}

// ========== FUNÇÃO ONSCANSUCCESS MODIFICADA ==========
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    // PARAR O SCANNER IMEDIATAMENTE
    if (html5QrCode) {
        html5QrCode.pause();
    }
    
    document.getElementById('manualCode').value = code;
    
    // Fechar a visualização da câmera
    const scannerContainer = document.getElementById('scannerContainer');
    const startBtn = document.getElementById('startBtn');
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-block';
    
    isScanning = false;
    
    // Buscar o produto
    searchProduct(code);
}

// ========== FLUXO DE BUSCA PRINCIPAL ==========
async function searchProduct(code) {
    if (!code || !isValidBarcode(code)) {
        showAlert('Código EAN inválido. Use 8-13 dígitos.', 'error');
        return;
    }
    
    clearResult();
    updateStatus(`Buscando produto ${code}...`, 'scanning');
    
    try {
        // 1º PASSO: Buscar no Banco Local (Google Sheets)
        const localResult = await searchInGoogleSheets(code);
        
        if (localResult && localResult.success && localResult.found) {
            currentProduct = localResult.product;
            showProductInfo(localResult.product, true);
            updateStatus(`✅ Encontrado no banco local`, 'success');
            return;
        }
        
        // 2º PASSO: Se não encontrou no banco local, buscar no Open Food Facts
        updateStatus('Não encontrado localmente. Buscando no Open Food Facts...', 'scanning');
        const openFoodProduct = await searchOpenFoodFacts(code);
        
        if (openFoodProduct && openFoodProduct.name) {
            showExternalProductInfo(openFoodProduct, code, 'Open Food Facts');
            updateStatus(`✅ Encontrado no Open Food Facts`, 'success');
            return;
        }
        
        // 3º PASSO: Se não encontrou no Open Food Facts, buscar no Bluesoft
        updateStatus('Não encontrado no Open Food Facts. Buscando no Bluesoft...', 'scanning');
        const bluesoftProduct = await searchBluesoftCosmos(code);
        
        if (bluesoftProduct && bluesoftProduct.name) {
            showExternalProductInfo(bluesoftProduct, code, 'Bluesoft Cosmos');
            updateStatus(`✅ Encontrado no Bluesoft Cosmos`, 'success');
            return;
        }
        
        // 4º PASSO: Se não encontrou em nenhuma fonte, mostrar formulário para cadastrar
        updateStatus('❌ Produto não encontrado em nenhuma fonte', 'error');
        showAddToDatabaseForm(code);
        
    } catch (error) {
        console.error('Erro no fluxo de busca:', error);
        updateStatus('Erro na busca. Tente novamente.', 'error');
        showErrorResult('Erro na busca', 'Ocorreu um erro ao buscar o produto.');
    }
}

// ========== BUSCA MANUAL ==========
function searchManual() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code || code.length < 8) {
        showAlert('Digite um código de barras válido (8-13 dígitos)', 'warning');
        return;
    }
    searchProduct(code);
}

// ========== BANCO LOCAL (GOOGLE SHEETS) ==========
async function searchInGoogleSheets(ean) {
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
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

async function getAllProductsFromSheets() {
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        return null;
    }
    
    try {
        const url = `${GOOGLE_SHEETS_API}?operation=getAll`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar todos os produtos:', error);
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
                brand: data.product.brands || data.product.brand || '',
                image: data.product.image_front_url || 
                       data.product.image_url || 
                       data.product.image_front_small_url || 
                       data.product.image_thumb_url || 
                       null,
                price: data.product.product_quantity || '',
                source: 'Open Food Facts'
            };
        }
        return null;
    } catch (error) {
        console.error('Erro Open Food Facts:', error);
        return null;
    }
}

async function searchBluesoftCosmos(code) {
    try {
        const response = await fetch(
            `https://api.cosmos.bluesoft.com.br/gtins/${code}.json`,
            {
                headers: {
                    'X-Cosmos-Token': BLUESOFT_API_KEY,
                    'User-Agent': 'Cosmos-API-Request',
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        return {
            name: data.description || 'Produto',
            brand: data.brand?.name || data.brand_name || data.manufacturer || '',
            image: data.thumbnail || data.image || null,
            price: data.price || data.average_price || '',
            source: 'Bluesoft Cosmos'
        };
        
    } catch (error) {
        console.error('Erro Bluesoft:', error);
        return null;
    }
}

// ========== RENDERIZAÇÃO DE RESULTADOS ==========
function showProductInfo(product, isFromDatabase = true) {
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
                    <span>Sem imagem</span>
                </div>
            </div>
        `;
    }
    
    let sourceBadge = isFromDatabase ? 
        '<span class="db-badge">BANCO LOCAL</span>' : 
        '<span class="db-missing">EXTERNO</span>';
    
    let priceHtml = '';
    if (product.preco) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i> R$ ${product.preco}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> EAN: ${product.ean}
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
                    <i class="fas fa-calendar"></i> Cadastro: ${product.cadastro}
                </div>
                ` : ''}
                
                <div class="source-badge">
                    <i class="fas fa-database"></i> ${sourceBadge}
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            ${isFromDatabase ? `
            <button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                <i class="fas fa-trash"></i> Excluir
            </button>
            ` : `
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', 'Banco Local')">
                <i class="fas fa-save"></i> Salvar no Banco
            </button>
            `}
            <button class="btn btn-secondary" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">
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
                    <span>Sem imagem</span>
                </div>
            </div>
        `;
    }
    
    let priceHtml = '';
    if (product.price) {
        priceHtml = `
            <div class="product-price">
                <i class="fas fa-money-bill-wave"></i> ${product.price}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">
                    <i class="fas fa-barcode"></i> EAN: ${code}
                </div>
                
                <div class="product-title">${product.name}</div>
                
                ${product.brand ? `
                <div class="product-brand">
                    <i class="fas fa-industry"></i> ${product.brand}
                </div>
                ` : ''}
                
                ${priceHtml}
                
                <div class="source-badge">
                    <i class="fas fa-external-link-alt"></i> Fonte: ${source} <span class="db-missing">EXTERNO</span>
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-save"></i> Salvar no Banco
            </button>
            <button class="btn btn-warning" onclick="openEditModalForNewProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-edit"></i> Editar antes de Salvar
            </button>
            <button class="btn btn-secondary" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
                <i class="fas fa-globe"></i> Pesquisar Online
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
                O produto não foi encontrado em nenhuma fonte.
            </p>
            
            <div class="action-buttons">
                <button class="btn btn-success" onclick="openManualAddModal('${code}')">
                    <i class="fas fa-plus"></i> Cadastrar Manualmente
                </button>
                <button class="btn btn-secondary" onclick="searchOnline('${code}')">
                    <i class="fas fa-globe"></i> Pesquisar na Web
                </button>
            </div>
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
            <button class="btn btn-secondary" onclick="searchManual()">
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

// ========== FUNÇÃO PARA MOSTRAR LISTA DE PRODUTOS ==========
async function showAllProducts() {
    updateStatus('Carregando todos os produtos...', 'scanning');
    clearResult();
    
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="loading" style="margin: 20px auto;"></div>
            <p>Carregando produtos do banco...</p>
        </div>
    `;
    resultDiv.classList.add('active');
    
    try {
        const result = await getAllProductsFromSheets();
        
        if (result && result.success && result.products && result.products.length > 0) {
            displayProductsList(result.products);
            updateStatus(`✅ ${result.products.length} produtos carregados`, 'success');
        } else {
            showNoProductsMessage();
            updateStatus('❌ Nenhum produto encontrado no banco', 'warning');
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        updateStatus('Erro ao carregar produtos', 'error');
        showErrorResult('Erro', 'Não foi possível carregar os produtos do banco.');
    }
}

function displayProductsList(products) {
    const resultDiv = document.getElementById('result');
    
    let productsHtml = `
        <div class="products-header">
            <h3><i class="fas fa-boxes"></i> Produtos no Banco (${products.length})</h3>
            <button class="btn btn-small btn-primary" onclick="showAllProducts()" style="margin: 0 0 15px 0;">
                <i class="fas fa-sync-alt"></i> Atualizar
            </button>
        </div>
    `;
    
    // Criar uma linha para cada produto
    products.forEach(product => {
        let imageHtml = product.imagem ? 
            `<img src="${product.imagem}" class="product-list-image" alt="${product.nome}" onerror="handleListImageError(this)">` :
            `<div class="product-list-no-image"><i class="fas fa-image"></i></div>`;
        
        let priceHtml = product.preco ? 
            `<span class="product-list-price">R$ ${product.preco}</span>` :
            `<span class="product-list-price na">N/A</span>`;
        
        productsHtml += `
            <div class="product-list-item" data-linha="${product.linha || ''}">
                <div class="product-list-image-container">
                    ${imageHtml}
                </div>
                <div class="product-list-details">
                    <div class="product-list-name">${product.nome}</div>
                    <div class="product-list-ean">EAN: ${product.ean}</div>
                </div>
                <div class="product-list-brand">${product.marca || 'Sem marca'}</div>
                <div class="product-list-price-container">
                    ${priceHtml}
                </div>
                <div class="product-list-actions">
                    <button class="btn-small btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    resultDiv.innerHTML = `
        <div class="products-list-container">
            ${productsHtml}
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showNoProductsMessage() {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">
                <i class="fas fa-box-open"></i>
            </div>
            <h3>Banco de dados vazio</h3>
            <p>Nenhum produto cadastrado no banco local.</p>
            <button class="btn btn-primary" onclick="searchManual()">
                <i class="fas fa-plus"></i> Adicionar Primeiro Produto
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

// ========== MODAL FUNCTIONS ==========
function openEditModal(ean, nome, marca, imagem, preco, linha) {
    currentModalType = 'edit';
    currentProduct = { ean, linha };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    // Atualizar título do modal
    document.querySelector('#editModal .modal-header h3').innerHTML = '<i class="fas fa-edit"></i> Editar Produto';
    
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('active');
}

function openEditModalForNewProduct(ean, nome, marca, imagem, preco, source) {
    currentModalType = 'new';
    currentProduct = { ean, source };
    
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editMarca').value = decodeURIComponent(marca);
    document.getElementById('editImagem').value = decodeURIComponent(imagem);
    document.getElementById('editPreco').value = decodeURIComponent(preco);
    
    // Atualizar título do modal
    document.querySelector('#editModal .modal-header h3').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Novo Produto';
    
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('active');
}

function openManualAddModal(code) {
    currentModalType = 'new';
    currentProduct = { ean: code };
    
    document.getElementById('editNome').value = '';
    document.getElementById('editMarca').value = '';
    document.getElementById('editImagem').value = '';
    document.getElementById('editPreco').value = '';
    
    // Atualizar título do modal
    document.querySelector('#editModal .modal-header h3').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Novo Produto';
    
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('active');
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('editModal').classList.add('hidden');
    currentProduct = null;
    currentModalType = 'edit';
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
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: currentModalType === 'edit' ? 'Editado' : 'API Externa'
    };
    
    if (currentProduct.linha && currentModalType === 'edit') {
        productData.linha = currentProduct.linha;
    }
    
    updateStatus('Salvando produto...', 'scanning');
    
    let result;
    if (currentModalType === 'edit') {
        result = await updateInGoogleSheets(productData);
    } else {
        result = await saveToGoogleSheets(productData);
    }
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        closeModal();
        
        // Se estava na lista de produtos, recarregar a lista
        if (document.querySelector('.products-list-container')) {
            setTimeout(() => showAllProducts(), 1000);
        } else {
            // Senão, buscar o produto novamente
            setTimeout(() => searchProduct(currentProduct.ean), 1000);
        }
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

// ========== FUNÇÕES DE CRUD ==========
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
        updateStatus('✅ Produto salvo no banco local!', 'success');
        setTimeout(() => searchProduct(code), 1000);
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

async function deleteProduct(ean, linha) {
    if (!confirm(`Tem certeza que deseja excluir o produto ${ean}?`)) {
        return;
    }
    
    updateStatus('Excluindo produto...', 'scanning');
    
    const result = await deleteFromGoogleSheets(ean, linha);
    
    if (result.success) {
        updateStatus('✅ Produto excluído do banco local!', 'success');
        
        // Se estava na lista de produtos, recarregar a lista
        if (document.querySelector('.products-list-container')) {
            setTimeout(() => showAllProducts(), 1000);
        } else {
            // Senão, mostrar mensagem
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
        }
    } else {
        updateStatus(`❌ Erro ao excluir: ${result.error || result.message}`, 'error');
    }
}

// ========== FUNÇÕES AUXILIARES ==========
function updateStatus(message, type = 'default') {
    const statusDiv = document.getElementById('status');
    
    let icon = '';
    switch(type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'error': icon = '<i class="fas fa-times-circle"></i>'; break;
        case 'warning': icon = '<i class="fas fa-exclamation-triangle"></i>'; break;
        case 'scanning': icon = '<div class="loading"></div>'; break;
        default: icon = '<i class="fas fa-info-circle"></i>';
    }
    
    statusDiv.innerHTML = `${icon} ${message}`;
    statusDiv.className = `status ${type}`;
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

function handleImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="no-image">
            <i class="fas fa-image"></i>
            <span>Imagem não carregada</span>
        </div>
    `;
}

function handleListImageError(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="product-list-no-image">
            <i class="fas fa-image"></i>
        </div>
    `;
}

function searchOnline(code, name = '') {
    const query = name ? `${decodeURIComponent(name)} ${code}` : `EAN ${code}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`, '_blank');
}

function showAlert(message, type = 'info') {
    alert(`[${type.toUpperCase()}] ${message}`);
}

function checkAPIStatus() {
    if (!GOOGLE_SHEETS_API) {
        console.warn("URL do Google Sheets não configurada");
        updateStatus('⚠️ Configure a URL do Google Sheets API!', 'warning');
    }
}

// ========== EXPORT FUNCTIONS TO GLOBAL SCOPE ==========
window.searchManual = searchManual;
window.initScanner = initScanner;
window.stopScanner = stopScanner;
window.searchOnline = searchOnline;
window.openEditModal = openEditModal;
window.openEditModalForNewProduct = openEditModalForNewProduct;
window.openManualAddModal = openManualAddModal;
window.closeModal = closeModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.saveExternalProductToDatabase = saveExternalProductToDatabase;
window.showAllProducts = showAllProducts;
window.handleImageError = handleImageError;
window.handleListImageError = handleListImageError;
