document.addEventListener('DOMContentLoaded', () => {
    const proxyServerUrl = 'http://localhost:3000';
    const heroSection = document.querySelector('.hero-section');
    const resultsPage = document.getElementById('results-page');
    const heroForm = document.getElementById('hero-form');
    
    // 메인 페이지 입력 필드
    const startPointHero = document.getElementById('start-point-hero');
    const endPointHero = document.getElementById('end-point-hero');
    const startSuggestions = document.getElementById('start-suggestions');
    const endSuggestions = document.getElementById('end-suggestions');

    // 결과 페이지의 입력 필드
    const startPointHeader = document.getElementById('start-point-header');
    const endPointHeader = document.getElementById('end-point-header');
    const arrivalDateHeader = document.getElementById('arrival-date-header');
    const arrivalTimeHeader = document.getElementById('arrival-time-header');
    const researchButton = document.getElementById('research-button');
    const routeSidebar = document.getElementById('route-sidebar');

    // 지도 및 경로 관련 전역 변수
    let map = null;
    let startMarker = null, endMarker = null;
    let routePolylines = [];
    let currentRoutesData = [];
    let debounceTimer;

    // --- 초기 UI 설정 ---
    resultsPage.style.display = 'none';
    setupDateTimeDefaults();
    setupModeSelectors();
    setupSwitch('date-switch-hero');
    setupSwitch('time-switch-hero');

    // --- 이벤트 리스너 ---
    heroForm.addEventListener('submit', handleFormSubmit);
    researchButton.addEventListener('click', () => {
        findAndDisplayRoutes(startPointHeader.value, endPointHeader.value);
    });

    startPointHero.addEventListener('input', () => handleAutocomplete(startPointHero, startSuggestions));
    endPointHero.addEventListener('input', () => handleAutocomplete(endPointHero, endSuggestions));

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            startSuggestions.style.display = 'none';
            endSuggestions.style.display = 'none';
        }
    });
    
    // --- 함수 정의 ---
    
    function setupDateTimeDefaults() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        document.getElementById('arrival-date-hero').value = `${year}-${month}-${day}`;
        document.getElementById('arrival-time-hero').value = `${hours}:${minutes}`;
    }

    function setupModeSelectors() {
        const modeButtons = document.querySelectorAll('.mode-selector button');
        modeButtons.forEach(button => {
            button.addEventListener('click', () => {
                modeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                if (resultsPage.style.display !== 'none') {
                    findAndDisplayRoutes(startPointHeader.value, endPointHeader.value);
                }
            });
        });
    }

    function setupSwitch(switchId) {
        const switchContainer = document.getElementById(switchId);
        if (!switchContainer) return;
        const buttons = switchContainer.querySelectorAll('.switch-btn');
        const input = switchContainer.closest('.input-group').querySelector('input');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                input.disabled = (button.dataset.value === 'off');
            });
        });
    }

    function handleAutocomplete(inputElement, suggestionsContainer) {
        clearTimeout(debounceTimer);
        const query = inputElement.value;

        if (!startCoords || !goalCoords) { 
            alert('출발지와 목적지를 모두 선택해주세요. (자동완성 목록에서 클릭)'); 
            return; 
        }
        
        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`${proxyServerUrl}/api/search?query=${encodeURIComponent(query)}`);
                const data = await response.json();
                
                suggestionsContainer.innerHTML = '';
                if (data.documents && data.documents.length > 0) {
                    data.documents.forEach(place => {
                        const item = document.createElement('div');
                        item.className = 'suggestion-item';
                        item.innerHTML = `
                            <div class="place-name">${place.place_name}</div>
                            <div class="address-name">${place.road_address_name || place.address_name}</div>
                        `;
                        item.addEventListener('click', () => {
                            inputElement.value = place.place_name;
                            suggestionsContainer.style.display = 'none';
                        });
                        suggestionsContainer.appendChild(item);
                    });
                    suggestionsContainer.style.display = 'block';
                } else {
                    suggestionsContainer.style.display = 'none';
                }
            } catch (error) {
                console.error("장소 검색 제안 실패:", error);
                suggestionsContainer.style.display = 'none';
            }
        }, 300);
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        
        const startPoint = startPointHero.value;
        const endPoint = endPointHero.value;
        
        if (!startPoint || !endPoint) {
            alert('출발지와 도착지를 모두 입력해주세요.');
            return;
        }

        startPointHeader.value = startPoint;
        endPointHeader.value = endPoint;
        arrivalDateHeader.value = document.getElementById('arrival-date-hero').value;
        arrivalTimeHeader.value = document.getElementById('arrival-time-hero').value;

        resultsPage.style.display = 'flex';
        resultsPage.scrollIntoView({ behavior: 'smooth' });

        if (!map) {
            const mapContainer = document.getElementById('map');
            const mapOption = {
                center: new kakao.maps.LatLng(37.5665, 126.9780),
                level: 5
            };
            map = new kakao.maps.Map(mapContainer, mapOption);
        }
        
        findAndDisplayRoutes(startPoint, endPoint);
    }
    
    async function getCoordinates(query) {
        try {
            const response = await fetch(`${proxyServerUrl}/api/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data.documents && data.documents.length > 0) {
                const place = data.documents[0];
                return {
                    coords: `${place.x},${place.y}`,
                    latlng: new kakao.maps.LatLng(place.y, place.x)
                };
            }
            return null;
        } catch (error) {
            console.error("장소 검색 실패:", error);
            return null;
        }
    }

    async function findAndDisplayRoutes(startQuery, endQuery) {
        routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>최적의 경로들을 탐색 중입니다...</p></div>';
        clearMap();
        
        const [startData, endData] = await Promise.all([
            getCoordinates(startQuery),
            getCoordinates(endQuery)
        ]);
        
        if (!startData || !endData) {
            alert('출발지 또는 도착지를 찾을 수 없습니다. 정확한 장소명을 입력해주세요.');
            routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>장소를 찾지 못해 경로 탐색에 실패했습니다.</p></div>';
            return;
        }
        
        startMarker = new kakao.maps.Marker({ position: startData.latlng, map: map });
        endMarker = new kakao.maps.Marker({ position: endData.latlng, map: map });

        const startCoords = startData.coords;
        const endCoords = endData.coords;
        const currentMode = document.querySelector('.mode-selector button.active').id.includes('car') ? 'driving' : 'walking';
        
        if (currentMode === 'walking') {
            routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>도보 길찾기는 현재 지원되지 않습니다.</p></div>';
        } else {
            // [수정] '시간 우선 경로'를 추가하여 총 4개의 옵션을 요청
            const priorities = [
                { code: 'RECOMMEND', title: '최적 경로' },
                { code: 'TIME', title: '시간 우선 경로' },
                { code: 'DISTANCE', title: '최단 경로' },
                { code: 'FREE', title: '무료 경로' }
            ];
            try {
                const requests = priorities.map(p =>
                    fetch(`${proxyServerUrl}/api/directions?origin=${startCoords}&destination=${endCoords}&priority=${p.code}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.routes && data.routes.length > 0) {
                            const bestRoute = data.routes[0];
                            bestRoute.customTitle = p.title;
                            return bestRoute;
                        }
                        return null;
                    })
                );
                const results = await Promise.all(requests);
                const validRoutes = results.filter(route => route !== null);

                if (validRoutes.length > 0) {
                    currentRoutesData = validRoutes;
                    displayRouteList(currentRoutesData);
                    drawAllRoutes(currentRoutesData);
                    routeSidebar.querySelector('.route-card')?.classList.add('active');
                } else {
                    routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>경로를 찾을 수 없습니다.</p></div>';
                }
            } catch (error) {
                console.error('길찾기 오류:', error);
                routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>경로 탐색에 실패했습니다.</p></div>';
            }
        }
    }

    function displayRouteList(routes) {
        routeSidebar.innerHTML = '';
        routes.forEach((route, index) => {
            const card = createRouteCard(route, index);
            routeSidebar.appendChild(card);
        });
    }

    function createRouteCard(route, index) {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.dataset.index = index;
        
        const summary = route.summary;
        const durationInMinutes = Math.floor(summary.duration / 60);
        const distanceInKm = (summary.distance / 1000).toFixed(1);
        const fare = summary.fare.taxi.toLocaleString();

        card.innerHTML = `
            <div class="route-card-header">${route.customTitle}</div>
            <div class="route-card-body">
                <span class="duration">${durationInMinutes}분</span>
                <span class="meta-info">${distanceInKm}km | 택시비 약 ${fare}원</span>
            </div>
        `;

        card.addEventListener('click', () => {
            routeSidebar.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            setActiveRoute(index);
        });
        return card;
    }

    function drawAllRoutes(routes) {
        const bounds = new kakao.maps.LatLngBounds();
        routes.forEach((route, index) => {
            const pathPoints = [];
            route.sections.forEach(section => {
                section.roads.forEach(road => {
                    for (let i = 0; i < road.vertexes.length; i += 2) {
                        const latlng = new kakao.maps.LatLng(road.vertexes[i + 1], road.vertexes[i]);
                        pathPoints.push(latlng);
                        bounds.extend(latlng);
                    }
                });
            });

            const isActive = index === 0;
            const polyline = new kakao.maps.Polyline({
                path: pathPoints,
                strokeWeight: isActive ? 8 : 6,
                strokeColor: isActive ? '#1B4373' : '#888888',
                strokeOpacity: isActive ? 0.9 : 0.5,
                zIndex: isActive ? 3 : 1
            });
            polyline.setMap(map);
            routePolylines.push(polyline);
        });
        map.setBounds(bounds);
    }
    
    function setActiveRoute(selectedIndex) {
        routePolylines.forEach((polyline, index) => {
            const isActive = index === selectedIndex;
            polyline.setOptions({
                strokeWeight: isActive ? 8 : 6,
                strokeColor: isActive ? '#1B4373' : '#888888',
                strokeOpacity: isActive ? 0.9 : 0.5,
                zIndex: isActive ? 3 : 1
            });
        });
    }
    
    function clearMap() {
        if (startMarker) startMarker.setMap(null);
        if (endMarker) endMarker.setMap(null);
        routePolylines.forEach(p => p.setMap(null));
        routePolylines = [];
    }
});