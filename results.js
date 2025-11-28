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
        TRANSIT: "#8B4513",
        ALTERNATIVE: "#BDBDBD",
        HIGHLIGHT: "#00FF00"
    },
    LOCALSTORAGE_PREFIX: 'javaproject_'
};

let map;
let directionsService;
let directionsRenderer;
let bicyclingLayer;
let customPolyline;
let customBorderPolyline = null;
let highlightPolyline = null;
let alternativePolylines = [];
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

    // 1. 같은 구간 다시 클릭 시: 하이라이트 해제
    if (currentHighlightedStep === feature) {
        if (highlightPolyline) highlightPolyline.setMap(null);
        highlightPolyline = null;
        currentHighlightedStep = null;
        return;
    }

    // 2. 새로운 구간 클릭 시: 기존 하이라이트 제거 후 새로 그리기
    if (highlightPolyline) highlightPolyline.setMap(null);

    highlightPolyline = new google.maps.Polyline({
        path: coords,
        strokeColor: "#00FF00", // 밝은 초록색 (잘 보이게)
        strokeOpacity: 1.0,
        strokeWeight: 12,       // 두께를 더 두껍게
        zIndex: 9999,
        map,
    });
    currentHighlightedStep = feature;

    // 3. 지도 범위 재설정 (줌인)
    const bounds = new google.maps.LatLngBounds();
    coords.forEach(p => {
        // 좌표 객체 호환성 처리 (함수형 vs 객체형)
        const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
        const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
        bounds.extend({ lat, lng });
    });

    // ✅ [핵심 수정] 패딩 값을 수정하여 사이드바에 가려지지 않게 함
    // 사이드바가 왼쪽에 있으므로 left에 450px 여백을 줌
    map.fitBounds(bounds, { 
        top: 50, 
        bottom: 50, 
        left: 450,  // 사이드바 폭(400px) + 여유분
        right: 50   // 오른쪽 여유분
    });
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
                transitOptions: (arrivalDateTime && !isNaN(arrivalDateTime)) ? { arrivalTime: arrivalDateTime } : undefined,
                provideRouteAlternatives: true // ✅ [추가] 대체 경로(회색 경로)도 함께 요청
            };

            // ✅ [수정] 렌더러 옵션 업데이트 (갈색 적용)
            directionsRenderer.setOptions({
                polylineOptions: {
                    strokeColor: CONFIG.COLORS.TRANSIT, // 정의한 갈색 사용
                    strokeWeight: 6,
                    strokeOpacity: 0.8
                }
            });

            directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                result.routes.sort((a, b) => {
                        const durationA = a.legs[0].duration.value;
                        const durationB = b.legs[0].duration.value;
                        return durationA - durationB;
                    });

                directionsRenderer.setDirections(result); // 지도에 모든 경로(메인+회색) 그리기

                // 컨테이너 초기화 (목록을 새로 그림)
                const container = document.getElementById('route-details-container');
                container.innerHTML = '';

                // ✅ [수정] 받아온 모든 경로에 대해 반복문 실행
                result.routes.forEach((route, index) => {
                    // 각 경로를 담을 개별 박스(wrapper) 생성 (순서 보장을 위해 미리 append)
                    const routeWrapper = document.createElement('div');
                    routeWrapper.id = `route-option-${index}`;
                    routeWrapper.style.marginBottom = "15px"; // 경로 간 간격
                    container.appendChild(routeWrapper);

                    // 개별 경로 정보를 화면에 표시하는 함수 호출
                    // (함수 시그니처를 변경해서 wrapper와 index를 넘겨줍니다)
                    displayGoogleRouteSummary(route, arrivalDateTime, routeWrapper, index);
                });

                // (선택 사항) 출발/도착 마커는 첫 번째 경로 기준으로 표시
                const leg = result.routes[0].legs[0];
                addStartEndMarkers([
                    { lat: leg.start_location.lat(), lng: leg.start_location.lng() },
                    { lat: leg.end_location.lat(), lng: leg.end_location.lng() },
                ]);
                    
                    // (addStartEndMarkers는 drawRoute 내부에서 자동으로 호출되므로 중복 제거)
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

// 통합 경로 그리기 함수 (Google Maps 데이터 지원 추가)
function drawRoute(data, color, routeType) {
    let path = [];
    
    // 데이터 파싱
    if (routeType === 'tmap') {
        data.features.forEach(feature => {
            if (feature.geometry.type === "LineString") {
                feature.geometry.coordinates.forEach(coord => {
                    path.push({ lng: coord[0], lat: coord[1] });
                });
            }
        });
    } else if (routeType === 'ors') {
        if (!data || !data.features || !data.features[0]) return;
        path = data.features[0].geometry.coordinates.map(coord => ({
            lng: coord[0],
            lat: coord[1],
        }));
    } else if (routeType === 'google') { 
        // 👈 [추가됨] Google Directions 데이터 처리
        if (data.routes && data.routes[0] && data.routes[0].overview_path) {
            data.routes[0].overview_path.forEach(p => {
                path.push({ lat: p.lat(), lng: p.lng() });
            });
        }
    }

    // 기존 경로 초기화
    if (customPolyline) customPolyline.setMap(null);
    if (customBorderPolyline) customBorderPolyline.setMap(null);

    // 1️⃣ [테두리] 흰색
    customBorderPolyline = new google.maps.Polyline({
        path,
        strokeColor: "white",
        strokeOpacity: 1,
        strokeWeight: 10,
        zIndex: 50,
        map,
    });

    // 2️⃣ [메인] 노란색(TRANSIT) 등 지정된 색상 + 화살표
    customPolyline = new google.maps.Polyline({
        path,
        strokeColor: color,
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: 51,
        map,
    });

    addStartEndMarkers(path);
    
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
}

// 🔀 대중교통 다중 경로 렌더링 및 클릭 스위칭 함수
function renderTransitResult(result, activeIndex, arrivalDateTime) {
    // 1. 기존 비활성 경로(회색 선들) 모두 지우기
    alternativePolylines.forEach(poly => poly.setMap(null));
    alternativePolylines = [];

    // 2. 모든 추천 경로 반복
    result.routes.forEach((route, index) => {
        if (index === activeIndex) {
            // ✅ 선택된 경로 (주인공): 예쁘게 그리기 (갈색 + 테두리 + 화살표)
            // drawRoute 함수가 내부적으로 customPolyline을 갱신하고 지도 범위를 맞춤
            drawRoute({ routes: [route] }, CONFIG.COLORS.TRANSIT, 'google');
            
            // 정보창(Summary) 업데이트
            displayGoogleRouteSummary(route, arrivalDateTime);
            
        } else {
            // ⚪ 선택되지 않은 경로 (조연): 회색 실선으로 그리기
            const path = route.overview_path;
            
            // 클릭 범위를 넓히기 위해 투명하고 두꺼운 선(Click Target)을 먼저 그림 (선택사항)
            const clickTargetLine = new google.maps.Polyline({
                path: path,
                strokeColor: "transparent",
                strokeOpacity: 0,
                strokeWeight: 20, // 클릭 판정 범위 넓게
                zIndex: 11,
                map: map
            });
            alternativePolylines.push(clickTargetLine);

            // 눈에 보이는 회색 선
            const grayLine = new google.maps.Polyline({
                path: path,
                strokeColor: CONFIG.COLORS.ALTERNATIVE,
                strokeOpacity: 0.6,
                strokeWeight: 6,
                zIndex: 10, // 활성 경로(50)보다 아래에
                map: map,
                clickable: false // 클릭 이벤트는 clickTargetLine이 받음 (또는 얘한테 직접 줘도 됨)
            });
            alternativePolylines.push(grayLine);

            // 🖱️ 클릭 이벤트: 회색 선을 누르면 해당 경로가 '주인공'이 됨
            const switchToThisRoute = () => {
                console.log(`${index + 1}번 경로 선택됨`);
                renderTransitResult(result, index, arrivalDateTime);
            };

            // 선 자체 클릭 시 전환
            grayLine.setOptions({ clickable: true }); 
            grayLine.addListener('click', switchToThisRoute);
            clickTargetLine.addListener('click', switchToThisRoute);
        }
    });
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



async function displayGoogleRouteSummary(route, arrivalDateTime, targetWrapper, index) {
    const leg = route.legs[0];
    
    // 1. 주소 및 시간 정보 추출
    const [startAddress, endAddress] = await Promise.all([
        getAddressFromCoords(leg.start_location.lat(), leg.start_location.lng()),
        getAddressFromCoords(leg.end_location.lat(), leg.end_location.lng())
    ]);

    const totalTime = Math.round(leg.duration.value / 60); // 분 단위 변환
    const distanceMatch = leg.distance.text.match(/[\d.]+/);
    const totalDistance = distanceMatch ? distanceMatch[0] : leg.distance.text;

    const recommendedStartTime = arrivalDateTime 
        ? TimeUtils.getRecommendedStartTime(arrivalDateTime.toISOString(), leg.duration.value)
        : null;
    const startTimeHtml = recommendedStartTime
        ? `<div class="route-card-footer"><i class="fa-solid fa-clock"></i><span>${recommendedStartTime} 출발 권장</span></div>`
        : '';

    // 2. 전체를 감싸는 박스(targetWrapper) 스타일링
    targetWrapper.className = 'route-wrapper-item';
    targetWrapper.style.borderRadius = '12px';
    targetWrapper.style.padding = '15px';
    targetWrapper.style.marginBottom = '20px';
    targetWrapper.style.backgroundColor = '#fff';
    targetWrapper.style.transition = 'all 0.2s ease';
    targetWrapper.style.cursor = 'pointer';
    targetWrapper.style.border = '1px solid #eee';

    // 3. 내용물 생성 및 추가

    // (1) 타이틀
    const titleDiv = document.createElement('div');
    titleDiv.innerHTML = index === 0 
        ? `<strong><i class="fa-solid fa-star" style="color:#FFD700;"></i> 추천 경로 (최단 시간)</strong>` 
        : `<strong>경로 ${index + 1}</strong>`;
    titleDiv.style.marginBottom = "10px";
    titleDiv.style.color = "#333";
    titleDiv.style.fontSize = "1.1em";
    targetWrapper.appendChild(titleDiv);

    // (2) 요약 카드
    const summaryCard = createRouteSummaryCard({
        mode: 'transit',
        totalTime,
        totalDistance,
        startAddress,
        endAddress,
        taxiFare: 0,
        startTimeHtml
    });
    summaryCard.style.border = 'none';
    summaryCard.style.boxShadow = 'none';
    summaryCard.style.padding = '0'; 
    summaryCard.style.margin = '0';
    targetWrapper.appendChild(summaryCard);

    // (3) 상세 단계 (Steps)
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'route-steps';
    stepsContainer.style.marginTop = "15px";
    
    leg.steps.forEach((step, stepIdx) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        let iconHtml = '<i class="fa-solid fa-person-walking"></i>';
        if (step.travel_mode === 'TRANSIT') iconHtml = '<i class="fa-solid fa-bus"></i>';
        if (step.travel_mode === 'DRIVING') iconHtml = '<i class="fa-solid fa-car"></i>';

        stepDiv.innerHTML = `
          ${iconHtml}
          <div class="step-details">
              <div class="step-instructions">${stepIdx + 1}. ${step.instructions}</div>
              <div class="step-meta">${step.distance.text} (${step.duration.text})</div>
          </div>`;
          
        // ✅ [수정됨] 개별 단계 클릭 시 좌표 추출 로직 강화
        stepDiv.addEventListener('click', (e) => {
            e.stopPropagation(); 
            
            // 1. 이 경로 활성화
            activateRouteWrapper(); 
            
            // 2. 단계 하이라이트 UI
            document.querySelectorAll(".step").forEach(el => el.classList.remove("active"));
            stepDiv.classList.add("active");

            // 3. 📍 [최종 수정] 좌표 추출 (만능 해독기 사용)
            let pathCoords = [];
            
            // (1) 이미 해독된 path가 있으면 사용
            if (step.path && Array.isArray(step.path)) {
                pathCoords = step.path;
            } 
            // (2) lat_lngs가 있으면 사용
            else if (step.lat_lngs && Array.isArray(step.lat_lngs)) {
                pathCoords = step.lat_lngs;
            }
            // (3) 대중교통용: 인코딩된 문자열을 직접 해독 (라이브러리 불필요!)
            else if (step.polyline && step.polyline.points) {
                pathCoords = decodePolyline(step.polyline.points);
            }

            // 좌표가 확보되었으면 줌인 실행
            if (pathCoords && pathCoords.length > 0) {
                // 좌표 객체 표준화 (함수형 -> 객체형)
                const coords = pathCoords.map(p => ({ 
                    lat: typeof p.lat === 'function' ? p.lat() : p.lat, 
                    lng: typeof p.lng === 'function' ? p.lng() : p.lng 
                }));
                highlightRouteSegment(coords, customPolyline, step);
            } else {
                console.warn("⚠️ 이 구간의 경로 데이터를 찾을 수 없습니다.");
            }
        });
        stepsContainer.appendChild(stepDiv);
    });
    targetWrapper.appendChild(stepsContainer);

    // 4. 경로 활성화 함수
    const HIGHLIGHT_COLOR = "#8B4513"; 

    function activateRouteWrapper() {
        document.querySelectorAll('.route-wrapper-item').forEach(el => {
            el.style.border = '1px solid #eee';
            el.style.boxShadow = 'none';
            el.style.backgroundColor = '#fff';
        });

        targetWrapper.style.border = `3px solid ${HIGHLIGHT_COLOR}`;
        targetWrapper.style.boxShadow = "0 6px 12px rgba(139, 69, 19, 0.15)";
        targetWrapper.style.backgroundColor = '#fffcf5'; 

        directionsRenderer.setRouteIndex(index);
    }

    // 5. 박스 전체 클릭 이벤트
    targetWrapper.addEventListener('click', () => {
        activateRouteWrapper();
        if (route.bounds) {
            map.fitBounds(route.bounds);
        }
    });

    // 6. 초기 상태 설정
    if (index === 0) {
        targetWrapper.style.border = `3px solid ${HIGHLIGHT_COLOR}`;
        targetWrapper.style.boxShadow = "0 6px 12px rgba(139, 69, 19, 0.15)";
        targetWrapper.style.backgroundColor = '#fffcf5';
    }
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

// [추가] 구글 경로 문자열 해독 함수 (라이브러리 없이 작동)
function decodePolyline(encoded) {
    if (!encoded) return [];
    var poly = [];
    var index = 0, len = encoded.length;
    var lat = 0, lng = 0;

    while (index < len) {
        var b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        var dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        var p = { lat: lat / 1e5, lng: lng / 1e5 };
        poly.push(p);
    }
    return poly;
}

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