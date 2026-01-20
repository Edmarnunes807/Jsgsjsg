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

const REAR_CAMERA_KEYWORDS = ["back", "rear", "environment", "traseira", "camera 0"];

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchManual();
    });
    
    // Remover sistema de tabs
    document.querySelectorAll('.tab-container, .tab').forEach(el => el.style.display = 'none');
    
    // Verificar status da API
    checkAPIStatus();
});

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
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    📷 Sem imagem
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
            <div style="margin-top: 10px; color: #10b981; font-weight: bold; font-size: 16px;">
                💰 R$ ${product.preco}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">📦 EAN: ${product.ean}</div>
                
                <div class="product-title">${product.nome}</div>
                
                ${product.marca ? `
                <div class="product-brand">🏭 ${product.marca}</div>
                ` : ''}
                
                ${priceHtml}
                
                ${product.cadastro ? `
                <div style="margin-top: 5px; font-size: 12px; color: #6b7280;">
                    📅 Cadastro: ${product.cadastro}
                </div>
                ` : ''}
                
                <div class="source-badge">${sourceBadge}</div>
            </div>
        </div>
        
        <div class="api-actions">
            ${isFromDatabase ? `
            <button class="btn btn-warning" onclick="openEditModal('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', '${product.linha || ''}')">
                ✏️ Editar
            </button>
            <button class="btn btn-danger" onclick="deleteProduct('${product.ean}', '${product.linha || ''}')">
                🗑️ Excluir
            </button>
            ` : `
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${product.ean}', '${encodeURIComponent(product.nome)}', '${encodeURIComponent(product.marca || '')}', '${encodeURIComponent(product.imagem || '')}', '${encodeURIComponent(product.preco || '')}', 'Banco Local')">
                💾 Salvar no Banco
            </button>
            `}
            <button class="btn" onclick="searchOnline('${product.ean}', '${encodeURIComponent(product.nome)}')">
                🌐 Pesquisar Online
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
                <div style="padding: 40px; text-align: center; color: #6b7280;">
                    📷 Sem imagem
                </div>
            </div>
        `;
    }
    
    let priceHtml = '';
    if (product.price) {
        priceHtml = `
            <div style="margin-top: 10px; color: #10b981; font-weight: bold; font-size: 16px;">
                💰 ${product.price}
            </div>
        `;
    }
    
    resultDiv.innerHTML = `
        <div class="product-card">
            ${imageHtml}
            
            <div class="product-details">
                <div class="product-code">📦 EAN: ${code}</div>
                
                <div class="product-title">${product.name}</div>
                
                ${product.brand ? `
                <div class="product-brand">🏭 ${product.brand}</div>
                ` : ''}
                
                ${priceHtml}
                
                <div class="source-badge">Fonte: ${source} <span class="db-missing">EXTERNO</span></div>
            </div>
        </div>
        
        <div class="api-actions">
            <button class="btn btn-success" onclick="saveExternalProductToDatabase('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                💾 Salvar no Banco
            </button>
            <button class="btn btn-warning" onclick="editExternalProduct('${code}', '${encodeURIComponent(product.name)}', '${encodeURIComponent(product.brand || '')}', '${encodeURIComponent(product.image || '')}', '${encodeURIComponent(product.price || '')}', '${source}')">
                ✏️ Editar antes de Salvar
            </button>
            <button class="btn" onclick="searchOnline('${code}', '${encodeURIComponent(product.name)}')">
                🌐 Pesquisar Online
            </button>
        </div>
    `;
    
    resultDiv.classList.add('active');
}

function showAddToDatabaseForm(code) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">➕</div>
            <h3 style="color: #6b7280; margin-bottom: 10px;">Produto não encontrado</h3>
            <p style="color: #9ca3af; font-size: 14px; margin-bottom: 20px;">
                Código: <strong>${code}</strong><br>
                O produto não foi encontrado em nenhuma fonte.
            </p>
            
            <div style="margin-top: 20px;">
                <button class="btn btn-success" onclick="openManualAddModal('${code}')">
                    ✏️ Cadastrar Manualmente
                </button>
                <button class="btn" onclick="searchOnline('${code}')" style="margin-top: 10px;">
                    🌐 Pesquisar na Web
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
            <div class="no-results-icon">⚠️</div>
            <h3 style="color: #6b7280; margin-bottom: 10px;">${title}</h3>
            <p style="color: #9ca3af; font-size: 14px;">${message}</p>
            <button class="btn" onclick="searchManual()" style="margin-top: 20px;">
                🔄 Tentar novamente
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

function openManualAddModal(code) {
    currentProduct = { ean: code };
    
    document.getElementById('editNome').value = '';
    document.getElementById('editMarca').value = '';
    document.getElementById('editImagem').value = '';
    document.getElementById('editPreco').value = '';
    
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
        nome: nome,
        marca: marca,
        imagem: imagem,
        preco: preco,
        fonte: currentProduct.linha ? 'Editado' : 'Manual'
    };
    
    if (currentProduct.linha) {
        productData.linha = currentProduct.linha;
    }
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = currentProduct.linha ? 
        await updateInGoogleSheets(productData) : 
        await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        closeModal();
        setTimeout(() => searchProduct(currentProduct.ean), 1000);
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
    
    updateStatus('Salvando produto...', 'scanning');
    
    const result = await saveToGoogleSheets(productData);
    
    if (result.success) {
        updateStatus('✅ Produto salvo no banco local!', 'success');
        closeModal();
        setTimeout(() => searchProduct(currentProduct.ean), 1000);
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
        
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🗑️</div>
                <h3 style="color: #6b7280; margin-bottom: 10px;">Produto excluído</h3>
                <p style="color: #9ca3af; font-size: 14px;">
                    Código: <strong>${ean}</strong>
                </p>
            </div>
        `;
    } else {
        updateStatus(`❌ Erro ao excluir: ${result.error || result.message}`, 'error');
    }
}

// ========== FUNÇÕES DO SCANNER ==========
function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const code = decodedText.trim();
    
    if (!isValidBarcode(code)) return;
    if (code === lastScanned && (now - lastScanTime) < 2000) return;
    
    lastScanned = code;
    lastScanTime = now;
    
    updateStatus(`📷 Código detectado: ${code}`, 'success');
    
    if (html5QrCode) html5QrCode.pause();
    
    document.getElementById('manualCode').value = code;
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
    
    let icon = '';
    switch(type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        case 'warning': icon = '⚠️'; break;
        case 'scanning': icon = '<div class="loading"></div>'; break;
        default: icon = 'ℹ️';
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
        <div style="padding: 40px; text-align: center; color: #6b7280;">
            📷 Imagem não carregada
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
window.openManualAddModal = openManualAddModal;
window.closeModal = closeModal;
window.saveEditedProduct = saveEditedProduct;
window.deleteProduct = deleteProduct;
window.saveExternalProductToDatabase = saveExternalProductToDatabase;
window.editExternalProduct = editExternalProduct;
window.handleImageError = handleImageError;
