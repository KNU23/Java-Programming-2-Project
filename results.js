// results.html을 위한 스크립트

// 상수 정의
const CONFIG = {
    BINARY_SEARCH_MAX_ITERATIONS: 10,
    BINARY_SEARCH_TOLERANCE_MS: 60 * 1000, // 1분
    BINARY_SEARCH_LOOKBACK_HOURS: 12,
    MAP_ZOOM_INCREMENT: 1.5,
    MAP_MAX_ZOOM: 18,
    DEFAULT_CENTER: { lat: 37.5665, lng: 126.9780 },
    DEFAULT_ZOOM: 12,
    COLORS: {
        WALKING: "#FF0000",
        BICYCLING: "#007BFF",
        DRIVING: "#6A36D9",
        HIGHLIGHT: "#ff3d00"
    },
    LOCALSTORAGE_PREFIX: 'javaproject_'
};

let map;
let directionsService;
let directionsRenderer;
let bicyclingLayer;
let customPolyline;
let highlightPolyline = null;
let currentHighlightedStep = null;
let previousZoomLevel = null;
let startMarker = null;
let endMarker = null;


// ✅ 위도·경도 → 주소 변환 함수
async function getAddressFromCoords(lat, lng) {
    return new Promise(resolve => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (res, status) => {
            if (status === "OK" && res[0]) resolve(res[0].formatted_address);
            else resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        });
    });
}

// 출발/도착 마커 표시 공용 함수
function addStartEndMarkers(path) {
    if (!path || path.length < 2) return;

    if (startMarker) startMarker.setMap(null);
    if (endMarker) endMarker.setMap(null);

    const start = path[0];
    const end = path[path.length - 1];

    startMarker = new google.maps.Marker({
        position: start,
        map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#34A853", // 초록색 = 출발
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
            scale: 8,
        },
        title: "출발지점",
    });

    endMarker = new google.maps.Marker({
        position: end,
        map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#EA4335", // 빨간색 = 도착
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
            scale: 8,
        },
        title: "도착지점",
    });
}


function highlightRouteSegment(coords, parentPolyline = null, feature = null) {
    if (!coords || !coords.length) return;

    // 같은 구간 다시 클릭 → 하이라이트 해제 + 줌 복귀
    if (currentHighlightedStep === feature) {
        if (highlightPolyline) highlightPolyline.setMap(null);
        highlightPolyline = null;
        currentHighlightedStep = null;

        // 지도 줌 복귀
        if (previousZoomLevel !== null) {
            map.setZoom(previousZoomLevel);
            previousZoomLevel = null; // 한 번 복귀 후 초기화
        }

        // 전체 경로 보기로 복귀 (옵션)
        if (parentPolyline) {
            const bounds = new google.maps.LatLngBounds();
            parentPolyline.getPath().forEach(p => bounds.extend(p));
            map.panToBounds(bounds, 80);
        }
        return;
    }

    // 새로운 구간 클릭
    if (highlightPolyline) highlightPolyline.setMap(null);

    // 현재 줌 저장
    previousZoomLevel = map.getZoom();

    // 하이라이트 생성
    highlightPolyline = new google.maps.Polyline({
        path: coords,
        strokeColor: CONFIG.COLORS.HIGHLIGHT,
        strokeOpacity: 0.6,
        strokeWeight: 12,
        zIndex: 999999,
        map,
    });
    currentHighlightedStep = feature;

    // 확대 동작
    const bounds = new google.maps.LatLngBounds();
    coords.forEach(p => bounds.extend(p));
    const center = bounds.getCenter();
    map.panTo(center);

    let currentZoom = map.getZoom();
    let targetZoom = currentZoom + CONFIG.MAP_ZOOM_INCREMENT;
    if (targetZoom > CONFIG.MAP_MAX_ZOOM) targetZoom = CONFIG.MAP_MAX_ZOOM;
    map.setZoom(targetZoom);
}


// 개선된 On/Off 스위치 (상태 기억 + 현재시간 유지 + 과거 시간 차단)
function setupSwitch(switchId) {
    const switchContainer = document.getElementById(switchId);
    if (!switchContainer) return;

    const buttons = switchContainer.querySelectorAll('.switch-btn');
    const inputGroup = switchContainer.closest('.input-group');
    const input = inputGroup.querySelector('input');
    const label = inputGroup.querySelector('label');

    // 🕓 현재 시간 가져오기 헬퍼
    const setToCurrentDateTime = () => {
        const current = getCurrentDateTime();
        if (switchId.includes('date')) {
            input.value = current.date;
        } else if (switchId.includes('time')) {
            input.value = current.time;
        }
    };

    // 로컬스토리지 상태 복원
    const savedState = localStorage.getItem(CONFIG.LOCALSTORAGE_PREFIX + switchId + "_state");
    if (savedState === "off") {
        buttons.forEach(btn => btn.classList.remove('active'));
        const offButton = switchContainer.querySelector('[data-value="off"]');
        offButton.classList.add('active');
        input.disabled = true;
        if (switchId.includes('time') && label) label.textContent = '출발 시간';
        setToCurrentDateTime(); // off 시 현재 시간 유지
    } else {
        // 기본 on 상태
        setToCurrentDateTime();
    }

    // 스위치 클릭 이벤트
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const isOff = button.dataset.value === 'off';
            input.disabled = isOff;

            // 상태 저장
            localStorage.setItem(CONFIG.LOCALSTORAGE_PREFIX + switchId + "_state", isOff ? "off" : "on");

            if (isOff) {
                setToCurrentDateTime();
                if (switchId.includes('time') && label) label.textContent = '출발 시간';
            } else {
                if (switchId.includes('time') && label) label.textContent = '도착 시간';
            }
        });
    });

    // 과거 시간 설정 차단
    if (switchId.includes('time')) {
        input.addEventListener('change', () => {
            const dateInput = document.querySelector('#arrival-date-header');
            if (!validateDateTime(dateInput.value, input.value)) {
                alert('⚠️ 출발 시간을 현재보다 과거로 설정할 수 없습니다.');
                setToCurrentDateTime();
            }
        });
    }

    if (switchId.includes('date')) {
        input.addEventListener('change', () => {
            const timeInput = document.querySelector('#arrival-time-header').value;
            if (!validateDateTime(input.value, timeInput)) {
                alert('⚠️ 출발 날짜를 과거로 설정할 수 없습니다.');
                setToCurrentDateTime();
            }
        });
    }
}

// 메시지를 서버(터미널)로만 로깅하는 함수
function logToServer(message) {
    fetch('/api/log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: message })
    }).catch(err => {
        console.error('서버 로그 전송 실패:', err);
    });
}

// 날짜/시간 검증 함수
function validateDateTime(date, time) {
    if (!date || !time) return true; // 값이 없으면 검증 통과
    try {
        const selectedDate = new Date(date + 'T' + time);
        const now = new Date();
        return selectedDate >= now;
    } catch (e) {
        console.error('날짜/시간 검증 오류:', e);
        return false;
    }
}

// 현재 날짜/시간 문자열 반환
function getCurrentDateTime() {
    const now = new Date();
    return {
        date: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`,
        time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    };
}

// 시간 유틸리티 함수 (싱글톤 패턴)
const TimeUtils = {
    // 권장 출발 시간 계산
    getRecommendedStartTime(arrivalDateTimeStr, totalTimeSeconds) {
        if (!arrivalDateTimeStr) return null;
        try {
            const arrivalTime = new Date(arrivalDateTimeStr);
            const departureTime = new Date(arrivalTime.getTime() - totalTimeSeconds * 1000);
            const hours = departureTime.getHours().toString().padStart(2, '0');
            const minutes = departureTime.getMinutes().toString().padStart(2, '0');
            if (isNaN(hours)) return null;
            return `${hours}:${minutes}`;
        } catch (e) {
            console.error("권장 출발 시간 계산 오류:", e);
            return null;
        }
    },
    // TMAP API 시간 포맷 변환
    formatToTmapTime(date) {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        const h = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${y}${m}${d}${h}${min}`;
    }
};

// 로딩 상태 표시/숨김
function showLoadingIndicator(message = "경로를 찾는 중...") {
    const container = document.getElementById('route-details-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p style="font-size: 18px; font-weight: 500;">${message}</p>
        </div>`;
}

function hideLoadingIndicator() {
    // 로딩 인디케이터는 실제 컨텐츠로 대체됨
}

// 에러 메시지 표시 (재시도 버튼 포함)
function showErrorMessage(message, onRetry = null) {
    const container = document.getElementById('route-details-container');
    const retryButton = onRetry ? `
        <button onclick="location.reload()" style="
            margin-top: 20px;
            padding: 10px 24px;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        ">
            <i class="fa-solid fa-rotate-right"></i> 다시 시도
        </button>` : '';
    
    container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #d32f2f;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 48px; margin-bottom: 20px;"></i>
            <h2 style="margin: 0 0 10px 0; font-size: 24px;">경로를 찾을 수 없습니다</h2>
            <p style="font-size: 16px; color: #666;">${message}</p>
            ${retryButton}
        </div>`;
}

// Google 지도 초기화
async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
    const { DirectionsService, DirectionsRenderer } = await google.maps.importLibrary("routes");
    const { Geocoder } = await google.maps.importLibrary("geocoding");

    map = new Map(document.getElementById("map"), { 
        center: CONFIG.DEFAULT_CENTER, 
        zoom: CONFIG.DEFAULT_ZOOM, 
        disableDefaultUI: true 
    });
    directionsService = new DirectionsService();
    directionsRenderer = new DirectionsRenderer();
    directionsRenderer.setMap(map);
    bicyclingLayer = new google.maps.BicyclingLayer();

    findAndDisplayRoute();
}

// [기존] (자동차용) 이진 탐색 함수
async function findDrivingRouteWithBinarySearch(startCoords, endCoords, desiredArrivalTime) {
    logToServer(`이진 탐색 시작. 희망 도착 시간: ${desiredArrivalTime.toLocaleString()}`);

    let low = new Date(desiredArrivalTime.getTime() - CONFIG.BINARY_SEARCH_LOOKBACK_HOURS * 60 * 60 * 1000);
    let high = new Date(desiredArrivalTime.getTime());

    let bestRouteData = null;
    let minDiff = Infinity;

    // 이진 탐색 시작
    for (let i = 0; i < CONFIG.BINARY_SEARCH_MAX_ITERATIONS; i++) {
        const midDepartureTime = new Date((low.getTime() + high.getTime()) / 2);
        const tmapTimeString = TimeUtils.formatToTmapTime(midDepartureTime);

        // [수정] 원본 주소와 도착 시간을 쿼리 파라미터로 추가
        const urlParams = new URLSearchParams(window.location.search);
        const startAddr = encodeURIComponent(urlParams.get('start'));
        const endAddr = encodeURIComponent(urlParams.get('end'));
        const arrivalStr = encodeURIComponent(desiredArrivalTime.toISOString()); // "2025-11-15T09:00:00.000Z"

        const apiUrl = `/api/tmap-car-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}&departureTime=${tmapTimeString}&startAddress=${startAddr}&endAddress=${endAddr}&arrivalDateTimeStr=${arrivalStr}`;

        logToServer(`[${i + 1}/${CONFIG.BINARY_SEARCH_MAX_ITERATIONS}] API 호출... 출발시간: ${midDepartureTime.toLocaleString()}`);

        const response = await fetch(apiUrl);
        const tmapData = await response.json();

        if (!response.ok) {
            logToServer(`API 호출 실패, 이진 탐색 중단: ${tmapData.error || 'Unknown error'}`);
            break;
        }

        const totalTimeSeconds = tmapData.features[0].properties.totalTime;
        const calculatedArrivalTime = new Date(midDepartureTime.getTime() + totalTimeSeconds * 1000);
        const diff = calculatedArrivalTime.getTime() - desiredArrivalTime.getTime();

        logToServer(`  ㄴ 소요시간: ${Math.round(totalTimeSeconds / 60)}분, 계산된 도착: ${calculatedArrivalTime.toLocaleString()}, 오차: ${Math.round(diff / 60000)}분`);

        if (Math.abs(diff) < minDiff) {
            minDiff = Math.abs(diff);
            bestRouteData = tmapData;
            bestRouteData.recommendedDepartureTime = midDepartureTime;
        }

        if (Math.abs(diff) <= CONFIG.BINARY_SEARCH_TOLERANCE_MS) {
            logToServer("정확한 시간 탐색 성공 (오차 1분 이내)");
            break;
        }

        if (diff > 0) {
            high = midDepartureTime;
        } else {
            low = midDepartureTime;
        }

        if (i === CONFIG.BINARY_SEARCH_MAX_ITERATIONS - 1) {
            logToServer("최대 반복 도달. 탐색 종료.");
        }
    }

    if (!bestRouteData) {
        logToServer("이진 탐색 완전 실패. 기본 경로로 대체합니다.");
        const fallbackResponse = await fetch(`/api/tmap-car-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
        bestRouteData = await fallbackResponse.json();
    }

    // 이진 탐색 완료 후 터미널 두 줄 띄우기
    logToServer("");
    logToServer("");

    return bestRouteData;
}


// 길찾기 메인 함수
async function findAndDisplayRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const start = urlParams.get('start');
    const end = urlParams.get('end');
    const mode = urlParams.get('mode');

    const arrivalDate = urlParams.get('date');
    const arrivalTime = urlParams.get('time');

    document.getElementById('start-point-header').value = start;
    document.getElementById('end-point-header').value = end;
    
    // URL에 날짜/시간 값이 있을 때만 input에 설정 (없으면 setupSwitch의 현재시간 유지)
    if (arrivalDate) document.getElementById('arrival-date-header').value = arrivalDate;
    if (arrivalTime) document.getElementById('arrival-time-header').value = arrivalTime;
    
    document.getElementById('transport-mode-header').value = mode;
    document.querySelectorAll('.transport-mode').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    if (!start || !end || !mode) return;

    let arrivalDateTime = null; // Google Transit API용
    let arrivalDateTimeStr = null; // TMAP/ORS 계산용
    
    // URL 파라미터가 없으면 현재 input 값 사용 (setupSwitch에서 설정한 현재시간)
    const finalDate = arrivalDate || document.getElementById('arrival-date-header').value;
    const finalTime = arrivalTime || document.getElementById('arrival-time-header').value;
    
    if (finalDate && finalTime) {
        const timeStr = finalTime.length === 5 ? `${finalTime}:00` : finalTime;
        arrivalDateTime = new Date(`${finalDate}T${timeStr}`);
        arrivalDateTimeStr = `${finalDate}T${timeStr}`;
    }

    directionsRenderer.setDirections({ routes: [] });
    if (customPolyline) customPolyline.setMap(null);

    bicyclingLayer.setMap(mode === 'BICYCLING' ? map : null);

    // 로딩 표시
    showLoadingIndicator();

    const geocoder = new google.maps.Geocoder();
    try {
        const startResult = await geocoder.geocode({ address: start });
        const endResult = await geocoder.geocode({ address: end });
        
        // Geocoding 결과 검증
        if (!startResult.results || startResult.results.length === 0) {
            throw new Error('출발지 주소를 찾을 수 없습니다. 주소를 확인해주세요.');
        }
        if (!endResult.results || endResult.results.length === 0) {
            throw new Error('도착지 주소를 찾을 수 없습니다. 주소를 확인해주세요.');
        }
        
        const startCoords = startResult.results[0].geometry.location;
        const endCoords = endResult.results[0].geometry.location;

        if (mode === 'WALKING') {
            const response = await fetch(`/api/directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
            const tmapData = await response.json();
            if (!response.ok) throw new Error(tmapData.error || 'TMAP API 요청 실패');
            drawRoute(tmapData, CONFIG.COLORS.WALKING, 'tmap');
            displayTmapRouteSummary(tmapData, arrivalDateTimeStr);

        } else if (mode === 'BICYCLING') {
            const response = await fetch(`/api/ors-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
            const orsData = await response.json();
            if (!response.ok) throw new Error(orsData.error || 'ORS API 요청 실패');
            drawRoute(orsData, CONFIG.COLORS.BICYCLING, 'ors');
            displayOrsRouteSummary(orsData, arrivalDateTimeStr);

        } else if (mode === 'DRIVING') {
            let tmapCarData;

            if (arrivalDateTime && !isNaN(arrivalDateTime)) {
                tmapCarData = await findDrivingRouteWithBinarySearch(startCoords, endCoords, arrivalDateTime);
            } else {
                const response = await fetch(`/api/tmap-car-directions?start=${startCoords.lng()},${startCoords.lat()}&end=${endCoords.lng()},${endCoords.lat()}`);
                tmapCarData = await response.json();
                if (!response.ok) throw new Error(tmapCarData.error || 'TMAP 자동차 API 요청 실패');
            }

            drawRoute(tmapCarData, CONFIG.COLORS.DRIVING, 'tmap');
            displayTmapCarRouteSummary(tmapCarData, arrivalDateTime);

        } else { // TRANSIT
            const request = {
                origin: start,
                destination: end,
                travelMode: google.maps.TravelMode.TRANSIT,
                transitOptions: (arrivalDateTime && !isNaN(arrivalDateTime)) ? { arrivalTime: arrivalDateTime } : undefined
            };

            directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    directionsRenderer.setDirections(result);
                    displayGoogleRouteSummary(result.routes[0], arrivalDateTime);

                    // 출발/도착 마커 표시
                    const leg = result.routes[0].legs[0];
                    const startLoc = leg.start_location;
                    const endLoc = leg.end_location;
                    addStartEndMarkers([
                        { lat: startLoc.lat(), lng: startLoc.lng() },
                        { lat: endLoc.lat(), lng: endLoc.lng() },
                    ]);
                } else {
                    const errorMsg = status === 'ZERO_RESULTS' 
                        ? '대중교통 경로를 찾을 수 없습니다. 다른 교통수단을 이용해보세요.'
                        : `경로 검색 중 오류가 발생했습니다. (${status})`;
                    showErrorMessage(errorMsg, true);
                    logToServer(`Google 대중교통 경로 찾기 실패: ${status}`);
                }
            });
        }
    } catch (e) {
        logToServer(`치명적 오류 발생: ${e.message}`);
        showErrorMessage(e.message, true);
    }
}

// 통합 경로 그리기 함수 (도보, 자전거, 자동차 모두 지원)
function drawRoute(data, color, routeType) {
    let path = [];
    
    if (routeType === 'tmap') {
        // TMAP 데이터 (도보, 자동차)
        data.features.forEach(feature => {
            if (feature.geometry.type === "LineString") {
                feature.geometry.coordinates.forEach(coord => {
                    path.push({ lng: coord[0], lat: coord[1] });
                });
            }
        });
    } else if (routeType === 'ors') {
        // ORS 데이터 (자전거)
        if (!data || !data.features || !data.features[0]) {
            console.error("❌ ORS 데이터가 올바르지 않습니다.", data);
            return;
        }
        path = data.features[0].geometry.coordinates.map(coord => ({
            lng: coord[0],
            lat: coord[1],
        }));
    }

    // 기존 폴리라인 제거
    if (customPolyline) customPolyline.setMap(null);
    
    // 새 경로 표시
    customPolyline = new google.maps.Polyline({
        path,
        strokeColor: color,
        strokeOpacity: routeType === 'ors' ? 0.85 : 0.8,
        strokeWeight: 6,
        map,
    });

    // 출발/도착 마커 추가
    addStartEndMarkers(path);

    // 지도 범위 자동 조정
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
}


// 통합 경로 요약 카드 생성 함수
function createRouteSummaryCard(config) {
    const { mode, totalTime, totalDistance, startAddress, endAddress, taxiFare, startTimeHtml } = config;
    
    const summaryCard = document.createElement('div');
    summaryCard.className = 'route-card';
    
    let modeInfo = '';
    switch(mode) {
        case 'walking':
            modeInfo = '<strong>도보 경로</strong>';
            break;
        case 'bicycling':
            modeInfo = '<strong>자전거 경로</strong>';
            break;
        case 'driving':
            modeInfo = `<strong>자동차 경로</strong><br>
                <span>예상 택시요금: ${taxiFare.toLocaleString()}원</span>`;
            break;
        case 'transit':
            modeInfo = '<strong>대중교통 경로</strong>';
            break;
    }
    
    summaryCard.innerHTML = `
        <div class="route-card-body">
            <span class="duration">약 ${totalTime} 분</span>
            <span class="meta-info">${totalDistance} km</span>
        </div>
        <div class="route-card-header">
            ${modeInfo}<br><br>
            <span style="color:#34A853;font-weight:bold;">● 출발지:</span> ${startAddress}<br>
            <span style="color:#EA4335;font-weight:bold;">● 도착지:</span> ${endAddress}
        </div>
        ${startTimeHtml}`;
    
    return summaryCard;
}

// 🥾 도보 요약 + 단계별 클릭 시 거리기반 하이라이트
async function displayTmapRouteSummary(tmapData, arrivalDateTimeStr) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const summary = tmapData.features[0].properties;
    const totalTime = Math.round(summary.totalTime / 60);
    const totalDistance = (summary.totalDistance / 1000).toFixed(1);

    const recommendedStartTime = TimeUtils.getRecommendedStartTime(arrivalDateTimeStr, summary.totalTime);
    const startTimeHtml = recommendedStartTime
        ? `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${recommendedStartTime} 출발 권장</span></div>`
        : '';

    // 좌표 추출 및 주소 변환
    const coords = [];
    tmapData.features.forEach(f => {
        if (f.geometry.type === "LineString") {
            f.geometry.coordinates.forEach(c => coords.push({ lat: c[1], lng: c[0] }));
        }
    });
    const start = coords[0];
    const end = coords[coords.length - 1];

    const [startAddress, endAddress] = await Promise.all([
        getAddressFromCoords(start.lat, start.lng),
        getAddressFromCoords(end.lat, end.lng)
    ]);

    const summaryCard = createRouteSummaryCard({
        mode: 'walking',
        totalTime,
        totalDistance,
        startAddress,
        endAddress,
        taxiFare: 0,
        startTimeHtml
    });
    container.appendChild(summaryCard);

    // 단계별 안내 리스트
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';

    tmapData.features.forEach((feature, idx) => {
        if (feature.geometry.type === "Point" && feature.properties.description) {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'step';
            stepDiv.innerHTML = `
                <i class="fa-solid fa-person-walking"></i>
                <div class="step-details">
                    <div class="step-instructions">${idx + 1}. ${feature.properties.description}</div>
                </div>
            `;

            // 클릭 시 거리 기반으로 가장 가까운 구간(LineString)을 찾아 하이라이트
            stepDiv.addEventListener('click', () => {
                document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
                stepDiv.classList.add("active");

                const segment = findClosestLineString(feature, tmapData);
                if (segment && segment.geometry?.coordinates) {
                    const coords = segment.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                    highlightRouteSegment(coords, tmapData, feature);
                } else {
                    console.warn("⚠️ 근접한 경로(LineString)를 찾지 못했습니다.");
                }
            });

            stepsContainer.appendChild(stepDiv);
        }
    });
    container.appendChild(stepsContainer);
}

// 🔍 클릭된 포인트 기준으로 가장 가까운 LineString을 찾는 함수
function findClosestLineString(feature, tmapData) {
    if (!feature.geometry?.coordinates) return null;
    const [fx, fy] = feature.geometry.coordinates;
    let closest = null;
    let minDist = Infinity;

    tmapData.features.forEach(f => {
        if (f.geometry.type === "LineString" && f.geometry.coordinates.length) {
            f.geometry.coordinates.forEach(([x, y]) => {
                const dx = fx - x;
                const dy = fy - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closest = f;
                }
            });
        }
    });

    return closest;
}


// 자동차 경로 요약 + 출발/도착 주소 표시
async function displayTmapCarRouteSummary(tmapData, arrivalDateTime) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const summary = tmapData.features[0].properties;
    const totalTime = Math.round(summary.totalTime / 60);
    const totalDistance = (summary.totalDistance / 1000).toFixed(1);

    let startTimeHtml = '';
    if (tmapData.recommendedDepartureTime) {
        const recTime = tmapData.recommendedDepartureTime;
        const hours = recTime.getHours().toString().padStart(2, '0');
        const minutes = recTime.getMinutes().toString().padStart(2, '0');
        startTimeHtml = `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${hours}:${minutes} 출발</span></div>`;
    } else if (arrivalDateTime && !isNaN(arrivalDateTime)) {
        const recommendedStartTime = TimeUtils.getRecommendedStartTime(arrivalDateTime.toISOString(), summary.totalTime);
        if (recommendedStartTime) {
            startTimeHtml = `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${recommendedStartTime} 출발 권장</span></div>`;
        }
    }

    // 출발/도착 좌표 추출 및 주소 변환
    const coords = [];
    tmapData.features.forEach(f => {
        if (f.geometry.type === "LineString") {
            f.geometry.coordinates.forEach(c => coords.push({ lat: c[1], lng: c[0] }));
        }
    });
    const start = coords[0];
    const end = coords[coords.length - 1];

    const [startAddress, endAddress] = await Promise.all([
        getAddressFromCoords(start.lat, start.lng),
        getAddressFromCoords(end.lat, end.lng)
    ]);

    const summaryCard = createRouteSummaryCard({
        mode: 'driving',
        totalTime,
        totalDistance,
        startAddress,
        endAddress,
        taxiFare: summary.taxiFare,
        startTimeHtml
    });
    container.appendChild(summaryCard);

    // 단계별 안내
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';
    tmapData.features.forEach((feature, idx) => {
        if (feature.geometry.type === "Point" && feature.properties.description) {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'step';
            stepDiv.innerHTML = `
                <i class="fa-solid fa-car"></i>
                <div class="step-details">
                    <div class="step-instructions">${idx + 1}. ${feature.properties.description}</div>
                </div>`;
            stepDiv.addEventListener('click', () => {
                document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
                stepDiv.classList.add("active");

                const segment = findClosestLineString(feature, tmapData);
                if (segment?.geometry?.coordinates) {
                    const coords = segment.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                    highlightRouteSegment(coords, customPolyline, feature);
                }
            });
            stepsContainer.appendChild(stepDiv);
        }
    });
    container.appendChild(stepsContainer);
}



// 영어 ORS 안내문을 한국어로 변환
function translateInstruction(text) {
    if (!text) return "";
    const dict = {
        "Head": "출발하여",
        "Continue": "직진",
        "Turn right": "오른쪽으로 회전",
        "Turn left": "왼쪽으로 회전",
        "Slight right": "오른쪽으로 살짝 회전",
        "Slight left": "왼쪽으로 살짝 회전",
        "Sharp right": "오른쪽으로 급회전",
        "Sharp left": "왼쪽으로 급회전",
        "destination": "목적지",
        "You have reached your destination": "목적지에 도착했습니다",
        "Keep right": "오른쪽으로 유지",
        "Keep left": "왼쪽으로 유지"
    };
    let result = text;
    for (const [en, ko] of Object.entries(dict)) {
        result = result.replace(new RegExp(en, "gi"), ko);
    }
    return result.trim();
}

// 자전거 경로 요약 + 출발/도착 주소 표시
async function displayOrsRouteSummary(orsData, arrivalDateTimeStr) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const summary = orsData.features[0].properties.summary;
    const totalTime = Math.round(summary.duration / 60);
    const totalDistance = (summary.distance / 1000).toFixed(1);

    // 권장 출발 시간 계산
    const recommendedStartTime = TimeUtils.getRecommendedStartTime(arrivalDateTimeStr, summary.duration);
    const startTimeHtml = recommendedStartTime
        ? `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${recommendedStartTime} 출발 권장</span></div>`
        : '';

    // 좌표 추출 및 주소 변환
    const coords = orsData.features[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    const start = coords[0];
    const end = coords[coords.length - 1];

    const [startAddress, endAddress] = await Promise.all([
        getAddressFromCoords(start.lat, start.lng),
        getAddressFromCoords(end.lat, end.lng)
    ]);

    const summaryCard = createRouteSummaryCard({
        mode: 'bicycling',
        totalTime,
        totalDistance,
        startAddress,
        endAddress,
        taxiFare: 0,
        startTimeHtml: startTimeHtml
    });
    container.appendChild(summaryCard);

    // 단계별 안내 (클릭 시 하이라이트)
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';

    const steps = orsData.features[0].properties.segments?.[0]?.steps || [];
    steps.forEach((step, idx) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        stepDiv.innerHTML = `
            <i class="fa-solid fa-bicycle"></i>
            <div class="step-details">
                <div class="step-instructions">${idx + 1}. ${translateInstruction(step.instruction)}</div>
                <div class="step-meta">${(step.distance / 1000).toFixed(1)}km / ${Math.round(step.duration / 60)}분</div>
            </div>`;
        stepDiv.addEventListener('click', () => {
            document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
            stepDiv.classList.add("active");

            if (step.way_points) {
                const [startIdx, endIdx] = step.way_points;
                const coords = orsData.features[0].geometry.coordinates
                    .slice(startIdx, endIdx + 1)
                    .map(c => ({ lat: c[1], lng: c[0] }));
                highlightRouteSegment(coords, customPolyline, step);
            }
        });
        stepsContainer.appendChild(stepDiv);
    });
    container.appendChild(stepsContainer);
}



// 대중교통 요약 + 출발/도착 주소 표시
async function displayGoogleRouteSummary(route, arrivalDateTime) {
    const container = document.getElementById('route-details-container');
    container.innerHTML = '';
    const leg = route.legs[0];

    const startLoc = leg.start_location;
    const endLoc = leg.end_location;
    const [startAddress, endAddress] = await Promise.all([
        getAddressFromCoords(startLoc.lat(), startLoc.lng()),
        getAddressFromCoords(endLoc.lat(), endLoc.lng())
    ]);

    // duration.text에서 "분" 추출
    const durationMatch = leg.duration.text.match(/\d+/);
    const totalTime = durationMatch ? durationMatch[0] : leg.duration.text;
    
    // distance.text에서 "km" 추출
    const distanceMatch = leg.distance.text.match(/[\d.]+/);
    const totalDistance = distanceMatch ? distanceMatch[0] : leg.distance.text;

    // 권장 출발 시간 계산
    const recommendedStartTime = arrivalDateTime 
        ? TimeUtils.getRecommendedStartTime(arrivalDateTime.toISOString(), leg.duration.value)
        : null;
    const startTimeHtml = recommendedStartTime
        ? `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${recommendedStartTime} 출발 권장</span></div>`
        : '';

    const summaryCard = createRouteSummaryCard({
        mode: 'transit',
        totalTime,
        totalDistance,
        startAddress,
        endAddress,
        taxiFare: 0,
        startTimeHtml: startTimeHtml
    });
    container.appendChild(summaryCard);

    // 단계별 안내 (클릭 하이라이트)
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';
    leg.steps.forEach((step, idx) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        let iconHtml = '<i class="fa-solid fa-person-walking"></i>';
        if (step.travel_mode === 'TRANSIT') iconHtml = '<i class="fa-solid fa-bus"></i>';
        if (step.travel_mode === 'DRIVING') iconHtml = '<i class="fa-solid fa-car"></i>';

        stepDiv.innerHTML = `
          ${iconHtml}
          <div class="step-details">
              <div class="step-instructions">${idx + 1}. ${step.instructions}</div>
              <div class="step-meta">${step.distance.text} (${step.duration.text})</div>
          </div>`;
        stepDiv.addEventListener('click', () => {
            document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
            stepDiv.classList.add("active");
            const decodedPath = google.maps.geometry.encoding.decodePath(step.polyline.points);
            const coords = decodedPath.map(p => ({ lat: p.lat(), lng: p.lng() }));
            highlightRouteSegment(coords, customPolyline, step);
        });
        stepsContainer.appendChild(stepDiv);
    });
    container.appendChild(stepsContainer);
}



// 페이지 로드 후 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {

    checkLoginStatus();
    const form = document.getElementById('results-form');
    const hiddenModeInput = document.getElementById('transport-mode-header');

    // 모드 버튼 클릭 시 UI만 변경 (API 호출 안 함)
    document.querySelectorAll('.mode-selector-sidebar .transport-mode').forEach(button => {
        button.addEventListener('click', () => {
            // active 상태 변경
            document.querySelectorAll('.transport-mode').forEach(btn => 
                btn.classList.remove('active')
            );
            button.classList.add('active');
            
            // hidden input 값만 설정 (form submit 제거)
            hiddenModeInput.value = button.dataset.mode.toUpperCase();

            form.submit();
        });
    });

    setupSwitch('date-switch-header');
    setupSwitch('time-switch-header');
});

/**
 * 서버에 현재 로그인 상태를 확인하고 UI를 업데이트하는 함수
 */
async function checkLoginStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        
        const userActionsDiv = document.getElementById('user-actions');
        if (!userActionsDiv) return;

        updateLoginUI(userActionsDiv, data.loggedIn, data.nickname);

    } catch (error) {
        console.error('로그인 상태 확인 실패:', error);
        const userActionsDiv = document.getElementById('user-actions');
        if (userActionsDiv) updateLoginUI(userActionsDiv, false);
    }
}

/**
 * 로그인 상태에 따라 UI (로그인/로그아웃 버튼)를 변경하는 함수
 */
function updateLoginUI(container, isLoggedIn, nickname) {
    if (isLoggedIn) {
        // [로그인된 상태] 닉네임과 로그아웃 버튼 표시
        container.innerHTML = `
            <span style="margin-right: 15px;">${nickname}님</span>
            <a href="/api/auth/logout" class="logout-link">로그아웃</a>
        `;
    } else {
        // [로그아웃된 상태] 로그인 버튼 표시 (index.html로 이동)
        container.innerHTML = `
            <a href="/index.html" id="kakao-login-btn">
                <i class="fa-solid fa-circle-user"></i>
                <span>로그인</span>
            </a>
        `;
        // results.html에서는 로그인 버튼 클릭 시 로그인 로직 대신 
        // 메인 페이지(index.html)로 이동시킵니다.
    }
}