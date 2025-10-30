// results.html을 위한 스크립트

let map;
let directionsService;
let directionsRenderer;
let bicyclingLayer;
let customPolyline; // TMAP 또는 ORS 경로 선을 저장할 변수

// On/Off 스위치 설정 함수
function setupSwitch(switchId) {
    const switchContainer = document.getElementById(switchId);
    if (!switchContainer) return;

    const buttons = switchContainer.querySelectorAll('.switch-btn');
    const inputGroup = switchContainer.closest('.input-group');
    const input = inputGroup.querySelector('input');
    const label = inputGroup.querySelector('label');

    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const isOff = button.dataset.value === 'off';
            input.disabled = isOff;

            if (isOff) {
                const now = new Date();
                if (switchId.includes('date')) {
                    const year = now.getFullYear();
                    const month = (now.getMonth() + 1).toString().padStart(2, '0');
                    const day = now.getDate().toString().padStart(2, '0');
                    input.value = `${year}-${month}-${day}`;
                } else if (switchId.includes('time')) {
                    const hours = now.getHours().toString().padStart(2, '0');
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    input.value = `${hours}:${minutes}`;
                    if (label) label.textContent = '출발 시간';
                }
            } else {
                if (switchId.includes('time')) {
                    if (label) label.textContent = '도착 시간';
                }
            }
        });
    });
}

// Google 지도 초기화
async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
    const { DirectionsService, DirectionsRenderer } = await google.maps.importLibrary("routes");
    const { Geocoder } = await google.maps.importLibrary("geocoding");

    map = new Map(document.getElementById("map"), { center: { lat: 37.5665, lng: 126.9780 }, zoom: 12, disableDefaultUI: true });
    directionsService = new DirectionsService();
    directionsRenderer = new DirectionsRenderer();
    directionsRenderer.setMap(map);
    bicyclingLayer = new google.maps.BicyclingLayer();

    findAndDisplayRoute();
}

// 길찾기 메인 함수
async function findAndDisplayRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const start = urlParams.get('start');
    const end = urlParams.get('end');
    const mode = urlParams.get('mode');
    
    // UI 업데이트
    document.getElementById('start-point-header').value = start;
    document.getElementById('end-point-header').value = end;
    document.getElementById('arrival-date-header').value = urlParams.get('date');
    document.getElementById('arrival-time-header').value = urlParams.get('time');
    document.getElementById('transport-mode-header').value = mode;
    document.querySelectorAll('.transport-mode').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    if (!start || !end || !mode) return;

    // 이전 경로 지우기
    directionsRenderer.setDirections({routes: []}); 
    if (customPolyline) customPolyline.setMap(null);

    bicyclingLayer.setMap(mode === 'BICYCLING' ? map : null);

    const geocoder = new google.maps.Geocoder();
    try {
        const startResult = await geocoder.geocode({ address: start });
        const endResult = await geocoder.geocode({ address: end });
        const startCoords = startResult.results[0].geometry.location;
        const endCoords = endResult.results[0].geometry.location;

        if (mode === 'WALKING') {
            const response = await fetch(`/api/directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
            const tmapData = await response.json();
            if (!response.ok) throw new Error(tmapData.error || 'TMAP API 요청 실패');
            drawTmapRoute(tmapData, "#FF0000"); // 도보 경로
            displayTmapRouteSummary(tmapData);

        } else if (mode === 'BICYCLING') {
            const response = await fetch(`/api/ors-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
            const orsData = await response.json();
            if (!response.ok) throw new Error(orsData.error || 'ORS API 요청 실패');
            drawOrsRoute(orsData); // 자전거 경로
            displayOrsRouteSummary(orsData);

        } else if (mode === 'DRIVING') {
            const response = await fetch(`/api/tmap-car-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
            const tmapCarData = await response.json();
            if (!response.ok) throw new Error(tmapCarData.error || 'TMAP 자동차 API 요청 실패');
            drawTmapRoute(tmapCarData, "#6A36D9"); // 자동차 경로 (보라색)
            displayTmapCarRouteSummary(tmapCarData);

        } else { // TRANSIT
            const request = { origin: start, destination: end, travelMode: google.maps.TravelMode.TRANSIT };
            directionsService.route(request, (result, status) => {
                const container = document.getElementById('route-details-container');
                if (status === 'OK') {
                    directionsRenderer.setDirections(result);
                    displayGoogleRouteSummary(result.routes[0]);
                } else {
                    container.innerHTML = `<h2>경로를 찾을 수 없습니다.</h2><p>오류: ${status}</p>`;
                }
            });
        }
    } catch (e) {
        console.error("주소 변환 또는 길찾기 실패:", e);
        document.getElementById('route-details-container').innerHTML = `<h2>오류</h2><p>${e.message}</p>`;
    }
}

// TMAP 경로를 그리는 공통 함수 (도보, 자동차)
function drawTmapRoute(tmapData, color) {
    const path = [];
    tmapData.features.forEach(feature => {
        if (feature.geometry.type === "LineString") {
            feature.geometry.coordinates.forEach(coord => {
                path.push({ lng: coord[0], lat: coord[1] });
            });
        }
    });
    customPolyline = new google.maps.Polyline({ path, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 6, map });
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
}

// ORS 자전거 경로를 그리는 함수
function drawOrsRoute(orsData) {
    const path = [];
    orsData.features[0].geometry.coordinates.forEach(coord => {
        path.push({ lng: coord[0], lat: coord[1] });
    });
    customPolyline = new google.maps.Polyline({ path, strokeColor: "#007BFF", strokeOpacity: 0.8, strokeWeight: 6, map });
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
}

// TMAP 도보 경로 정보를 사이드바에 표시
function displayTmapRouteSummary(tmapData) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = ''; 
    const summary = tmapData.features[0].properties;
    const totalTime = Math.round(summary.totalTime / 60);
    const totalDistance = (summary.totalDistance / 1000).toFixed(1);
    const summaryCard = document.createElement('div');
    summaryCard.className = 'route-card';
    summaryCard.innerHTML = `<div class="route-card-body"><span class="duration">약 ${totalTime} 분</span><span class="meta-info">${totalDistance} km</span></div><div class="route-card-header"><strong>도보 경로</strong></div>`;
    container.appendChild(summaryCard);
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';
    tmapData.features.forEach(feature => {
        if(feature.geometry.type === "Point" && feature.properties.description) {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'step';
            stepDiv.innerHTML = `<i class="fa-solid fa-person-walking"></i><div class="step-details"><div class="step-instructions">${feature.properties.description}</div></div>`;
            stepsContainer.appendChild(stepDiv);
        }
    });
    container.appendChild(stepsContainer);
}

// TMAP 자동차 경로 정보를 사이드바에 표시
function displayTmapCarRouteSummary(tmapData) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const summary = tmapData.features[0].properties;
    const totalTime = Math.round(summary.totalTime / 60);
    const totalDistance = (summary.totalDistance / 1000).toFixed(1);
    const summaryCard = document.createElement('div');
    summaryCard.className = 'route-card';
    summaryCard.innerHTML = `
        <div class="route-card-body">
            <span class="duration">약 ${totalTime} 분</span>
            <span class="meta-info">${totalDistance} km</span>
        </div>
        <div class="route-card-header">
            <strong>자동차 경로</strong><br>
            <span>예상 택시요금: ${summary.taxiFare.toLocaleString()}원</span>
        </div>
    `;
    container.appendChild(summaryCard);
}

// ORS 자전거 경로 정보를 사이드바에 표시
function displayOrsRouteSummary(orsData) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = ''; 
    const summary = orsData.features[0].properties.summary;
    const totalTime = Math.round(summary.duration / 60);
    const totalDistance = (summary.distance / 1000).toFixed(1);
    const summaryCard = document.createElement('div');
    summaryCard.className = 'route-card';
    summaryCard.innerHTML = `<div class="route-card-body"><span class="duration">약 ${totalTime} 분</span><span class="meta-info">${totalDistance} km</span></div><div class="route-card-header"><strong>자전거 경로</strong></div>`;
    container.appendChild(summaryCard);
}

// Google 대중교통 경로 정보를 사이드바에 표시
function displayGoogleRouteSummary(route) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const leg = route.legs[0];
    const summaryCard = document.createElement('div');
    summaryCard.className = 'route-card';
    summaryCard.innerHTML = `<div class="route-card-body"><span class="duration">${leg.duration.text}</span><span class="meta-info">${leg.distance.text}</span></div><div class="route-card-header"><strong>출발:</strong> ${leg.start_address}<br><strong>도착:</strong> ${leg.end_address}</div>`;
    container.appendChild(summaryCard);
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';
    leg.steps.forEach(step => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        let iconHtml = '<i class="fa-solid fa-location-dot"></i>';
        if (step.travel_mode === 'TRANSIT') iconHtml = '<i class="fa-solid fa-bus"></i>';
        stepDiv.innerHTML = `${iconHtml}<div class="step-details"><div class="step-instructions">${step.instructions}</div><div class="step-meta">${step.distance.text} (${step.duration.text})</div></div>`;
        stepsContainer.appendChild(stepDiv);
    });
    container.appendChild(stepsContainer);
}

// 페이지 로드 후 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('results-form');
    const hiddenModeInput = document.getElementById('transport-mode-header');
    
    document.querySelectorAll('.mode-selector-sidebar .transport-mode').forEach(button => {
        button.addEventListener('click', () => {
            hiddenModeInput.value = button.dataset.mode.toUpperCase();
            form.requestSubmit();
        });
    });

    setupSwitch('date-switch-header');
    setupSwitch('time-switch-header');
});