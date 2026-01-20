// ========== CONFIGURAÇÕES ==========
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycbzgcibH369NS25K6afIYWfspNev0OcaXkRl2C2_HsmNGvdMTTK0OO4cn0VqmaC70GLGfg/exec"; // ← COLE SUA URL AQUI
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
});

// ========== FLUXO DE BUSCA OTIMIZADO ==========
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
            showProductInfo(localResult.product, 'Banco Local', true);
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
    if (!GOOGLE_SHEETS_API || GOOGLE_SHEETS_API.includes("SUA_URL_DO_GOOGLE_APPS_SCRIPT")) {
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
        // Usando proxy para evitar CORS
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
            name: data.description || data.description || 'Produto',
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
            <button class="btn btn-warning" onclick="editExternalProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                <i class="fas fa-edit"></i> Editar antes de Salvar
            </button>
            <button class="btn" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
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
                Código EAN: <strong>${code}</strong><br>
                O produto não foi encontrado em nenhuma fonte.
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
                    <button class="btn" onclick="searchOnline('${code}')">
                        <i class="fas fa-globe"></i> Pesquisar na Web
                    </button>
                </div>
            </div>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

// ========== FUNÇÕES DE SALVAMENTO ==========
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
        // Aguardar um momento e buscar novamente para mostrar do banco
        setTimeout(() => {
            searchProduct(code);
        }, 1500);
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

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
        updateStatus('✅ Produto salvo no banco local!', 'success');
        setTimeout(() => searchProduct(code), 1000);
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

function editExternalProduct(code, name, brand, image, price, source) {
    currentProduct = { ean: code, source };
    
    document.getElementById('editNome').value = decodeURIComponent(name);
    document.getElementById('editMarca').value = decodeURIComponent(brand);
    document.getElementById('editImagem').value = decodeURIComponent(image);
    document.getElementById('editPreco').value = decodeURIComponent(price);
    
    // Mudar o botão de salvar para salvar produto externo
    const saveBtn = document.getElementById('saveEditBtn');
    saveBtn.onclick = () => saveEditedExternalProduct();
    
    document.getElementById('editModal').classList.add('active');
}

async function saveEditedExternalProduct() {
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
        fonte: currentProduct.source || 'API Externa'
    };
    
    updateStatus('Salvando produto editado...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        closeModal();
        setTimeout(() => searchProduct(currentProduct.ean), 1000);
    } else {
        updateStatus(`❌ Erro ao salvar: ${result.error || result.message}`, 'error');
    }
}

// ========== SCANNER FUNCTIONS ==========
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    if (html5QrCode) html5QrCode.pause();
    
    // Atualizar campo de entrada manual
    document.getElementById('manualCode').value = code;
    
    // Iniciar busca
    searchProduct(code);
    
    setTimeout(() => {
        if (html5QrCode && isScanning) {
            html5QrCode.resume();
            updateStatus('Pronto para escanear novamente...', 'scanning');
        }
    }, 3000);
}

// ========== FUNÇÕES AUXILIARES ==========
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

function clearResult() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
    resultDiv.classList.remove('active');
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

// ========== FUNÇÕES GLOBAIS (para onclick) ==========
window.searchManual = searchManual;
window.searchOnline = function(code, name = '') {
    const query = name ? `${decodeURIComponent(name)} ${code}` : `EAN ${code}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`, '_blank');
};
window.handleImageError = function(img) {
    img.onerror = null;
    img.parentElement.innerHTML = `
        <div class="no-image">
            <i class="fas fa-image"></i>
            <span>Imagem não carregada</span>
        </div>
    `;
};

// As funções do scanner e modal permanecem iguais do código anterior
// (initScanner, stopScanner, openEditModal, closeModal, etc.)
// ... [mantenha o restante das funções do scanner e modal do código anterior]

// Para simplificar, mantenho apenas as funções essenciais aqui
// O restante do código do scanner pode ser copiado do código anterior
