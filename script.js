document.addEventListener('DOMContentLoaded', () => {
    const proxyServerUrl = 'http://localhost:3000';

    // 카카오 지도 초기화
    const mapContainer = document.getElementById('map');
    const mapOption = {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 5
    };
    const map = new kakao.maps.Map(mapContainer, mapOption);

    // 지도 위에 표시될 요소들을 저장할 변수
    let startMarker = null, goalMarker = null;
    let routePolyline = null, routePolylineBorder = null; // 📌 테두리 선을 위한 변수 추가
    let routeMarkers = []; 

    // HTML 요소 선택
    // (이전과 동일)
    const startInput = document.getElementById('start-input');
    const goalInput = document.getElementById('goal-input');
    const searchButton = document.getElementById('search-button');
    const startResults = document.getElementById('start-results');
    const goalResults = document.getElementById('goal-results');
    const modeButtonsContainer = document.getElementById('mode-buttons');
    const routeSummaryPanel = document.getElementById('route-summary');

    // --- 자동완성 및 기타 함수 (이전과 동일) ---
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const fetchSearchResults = async (query, resultsContainer, inputElement) => {
        if (!query) {
            resultsContainer.innerHTML = '';
            resultsContainer.style.display = 'none';
            return;
        }
        try {
            const response = await fetch(`${proxyServerUrl}/api/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            displayResults(data.documents || [], resultsContainer, inputElement);
        } catch (error) {
            console.error("Search API fetch error:", error);
        }
    };

    const displayResults = (items, resultsContainer, inputElement) => {
        resultsContainer.innerHTML = '';
        if (items.length > 0) {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `<div class="item-title">${item.place_name}</div><div class="item-address">${item.address_name}</div>`;
                
                div.addEventListener('click', () => {
                    inputElement.value = item.place_name;
                    inputElement.dataset.coords = `${item.x},${item.y}`; 
                    resultsContainer.style.display = 'none';
                });
                resultsContainer.appendChild(div);
            });
            resultsContainer.style.display = 'block';
        } else {
            resultsContainer.style.display = 'none';
        }
    };

    startInput.addEventListener('input', debounce(() => fetchSearchResults(startInput.value, startResults, startInput), 300));
    goalInput.addEventListener('input', debounce(() => fetchSearchResults(goalInput.value, goalResults, goalInput), 300));
    
    document.addEventListener('click', (e) => {
        if (!startInput.contains(e.target)) startResults.style.display = 'none';
        if (!goalInput.contains(e.target)) goalResults.style.display = 'none';
    });

    let currentMode = 'driving';
    modeButtonsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            modeButtonsContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentMode = e.target.dataset.mode;
        }
    });
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const locPosition = new kakao.maps.LatLng(lat, lng);
            map.setCenter(locPosition);
            
            const geocoder = new kakao.maps.services.Geocoder();
            geocoder.coord2Address(lng, lat, (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    const address = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
                    startInput.value = address;
                    startInput.dataset.coords = `${lng},${lat}`;
                }
            });
        }, () => {
            console.error("Could not get location information.");
        });
    }

    searchButton.addEventListener('click', findAndDrawRoute);
    goalInput.addEventListener('keydown', (e) => e.key === 'Enter' && findAndDrawRoute());

    async function findAndDrawRoute() {
        const startCoords = startInput.dataset.coords;
        const goalCoords = goalInput.dataset.coords;

        if (!startCoords || !goalCoords) { 
            alert('출발지와 목적지를 모두 선택해주세요. (자동완성 목록에서 클릭)'); 
            return; 
        }
        
        try {
            const response = await fetch(`${proxyServerUrl}/api/directions?origin=${startCoords}&destination=${goalCoords}&mode=${currentMode}`);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                drawRoute(route.sections);
                displayRouteSummary(route.summary);
            } else {
                alert('경로를 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('길찾기 과정에서 오류 발생:', error); 
            alert('경로를 찾는 데 실패했습니다.'); 
        }
    }
    
       // 📌 --- 경로 그리기 함수 (drawRoute) 전체 수정 ---
    function drawRoute(sections) {
        // 기존 지도 요소들 모두 제거
        if (startMarker) startMarker.setMap(null);
        if (goalMarker) goalMarker.setMap(null);
        if (routePolyline) routePolyline.setMap(null);
        if (routePolylineBorder) routePolylineBorder.setMap(null);
        routeMarkers.forEach(marker => marker.setMap(null));
        routeMarkers = [];

        const pathPoints = [];
        const bounds = new kakao.maps.LatLngBounds();

        sections.forEach(section => {
            section.roads.forEach(road => {
                for (let i = 0; i < road.vertexes.length; i += 2) {
                    const lng = road.vertexes[i];
                    const lat = road.vertexes[i + 1];
                    const point = new kakao.maps.LatLng(lat, lng);
                    pathPoints.push(point);
                    bounds.extend(point);
                }
            });
        });

        // 1. 테두리 폴리라인 생성
        routePolylineBorder = new kakao.maps.Polyline({
            path: pathPoints,
            strokeWeight: 9,
            strokeColor: '#00008B',
            strokeOpacity: 0.8,
            strokeStyle: 'solid',
            zIndex: 1
        });
        routePolylineBorder.setMap(map);

        // 2. 메인 폴리라인 생성
        routePolyline = new kakao.maps.Polyline({
            path: pathPoints,
            strokeWeight: 5,
            strokeColor: '#00BFFF',
            strokeOpacity: 0.9,
            strokeStyle: 'solid',
            zIndex: 2
        });
        routePolyline.setMap(map);

        // 경로 점 마커 (이전과 동일)
        const markerImageSrc = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/point_blue.png';
        const markerImageSize = new kakao.maps.Size(6, 6);
        const markerImage = new kakao.maps.MarkerImage(markerImageSrc, markerImageSize);
        const markerInterval = 10;
        for (let i = 0; i < pathPoints.length; i += markerInterval) {
            const pointMarker = new kakao.maps.Marker({
                position: pathPoints[i],
                image: markerImage,
                map: map,
                zIndex: 3
            });
            routeMarkers.push(pointMarker);
        }

        // 📌 3. 출발/도착 마커를 기본 마커로 변경
        const startPoint = pathPoints[0];
        const goalPoint = pathPoints[pathPoints.length - 1];
        
        // 📌 커스텀 이미지 관련 코드를 모두 제거하고, 가장 기본적인 형태로 마커를 생성합니다.
        startMarker = new kakao.maps.Marker({ position: startPoint, zIndex: 5 });
        goalMarker = new kakao.maps.Marker({ position: goalPoint, zIndex: 5 });

        startMarker.setMap(map);
        goalMarker.setMap(map);

        map.setBounds(bounds);
    }

    function displayRouteSummary(summary) {
        const duration = summary.duration; 
        const distance = summary.distance; 

        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const distanceKm = (distance / 1000).toFixed(1);

        let timeHtml = '';
        if (hours > 0) timeHtml += `${hours}시간 `;
        timeHtml += `${minutes}분`;

        routeSummaryPanel.innerHTML = `
            <div class="total-time" style="color: #3C1E1E;">${timeHtml}</div>
            <div class="total-distance">총 거리 ${distanceKm}km</div>
        `;
        routeSummaryPanel.style.display = 'block';
    }
});