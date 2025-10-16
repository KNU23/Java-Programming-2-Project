document.addEventListener('DOMContentLoaded', () => {
    // --- 기본 설정 및 변수 ---
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
        const startX = startPointHeader.dataset.x;
        const startY = startPointHeader.dataset.y;
        const endX = endPointHeader.dataset.x;
        const endY = endPointHeader.dataset.y;
        if (startX && startY && endX && endY) {
            findAndDisplayRoutes(startX, startY, endX, endY);
        } else {
            alert("출발지 또는 도착지 정보가 올바르지 않습니다.");
        }
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
                    const startX = startPointHeader.dataset.x;
                    const startY = startPointHeader.dataset.y;
                    const endX = endPointHeader.dataset.x;
                    const endY = endPointHeader.dataset.y;
                    if (startX && startY && endX && endY) {
                        findAndDisplayRoutes(startX, startY, endX, endY);
                    }
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

        if (query.trim().length < 2) {
            suggestionsContainer.style.display = 'none';
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
                            inputElement.dataset.x = place.x;
                            inputElement.dataset.y = place.y;
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

        const startPointName = startPointHero.value;
        const endPointName = endPointHero.value;

        if (!startPointName || !endPointName) {
            alert('출발지와 도착지를 모두 입력해주세요.');
            return;
        }

        const startX = startPointHero.dataset.x;
        const startY = startPointHero.dataset.y;
        const endX = endPointHero.dataset.x;
        const endY = endPointHero.dataset.y;

        if (!startX || !startY || !endX || !endY) {
            alert('출발지 또는 도착지의 좌표를 찾을 수 없습니다. 장소를 다시 선택해주세요.');
            return;
        }

        startPointHeader.value = startPointName;
        endPointHeader.value = endPointName;
        startPointHeader.dataset.x = startX;
        startPointHeader.dataset.y = startY;
        endPointHeader.dataset.x = endX;
        endPointHeader.dataset.y = endY;

        arrivalDateHeader.value = document.getElementById('arrival-date-hero').value;
        arrivalTimeHeader.value = document.getElementById('arrival-time-hero').value;

        resultsPage.style.display = 'flex';
        resultsPage.scrollIntoView({ behavior: 'smooth' });

        if (!map) {
            const mapContainer = document.getElementById('map');
            map = new Tmapv2.Map(mapContainer, {
                center: new Tmapv2.LatLng(startY, startX),
                width: "100%",
                height: "100%",
                zoom: 15
            });
        }

        findAndDisplayRoutes(startX, startY, endX, endY);
    }

    async function findAndDisplayRoutes(startX, startY, endX, endY) {
        routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>최적의 경로들을 탐색 중입니다...</p></div>';
        clearMap();

        startMarker = new Tmapv2.Marker({
            position: new Tmapv2.LatLng(startY, startX),
            map: map
        });
        endMarker = new Tmapv2.Marker({
            position: new Tmapv2.LatLng(endY, endX),
            map: map
        });

        const activeModeButton = document.querySelector('.mode-selector button.active');
        let currentMode = 'driving';
        if (activeModeButton.id.includes('walk')) {
            currentMode = 'walking';
        } else if (activeModeButton.id.includes('bike')) {
            routeSidebar.innerHTML = '<div class="sidebar-content"><h2>경로 정보</h2><p>자전거 길찾기는 현재 지원되지 않습니다.</p></div>';
            return;
        }

        try {
            const response = await fetch(`${proxyServerUrl}/api/directions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startX, startY, endX, endY, mode: currentMode
                }),
            });

            const data = await response.json();

            if (data.features && data.features.length > 0) {
                currentRoutesData = data.features;
                displayRouteList(currentRoutesData, currentMode);
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

    function displayRouteList(features, mode) {
        routeSidebar.innerHTML = '';
        // 경로 요약 정보는 보통 첫 번째 feature에 들어있습니다.
        const summaryFeature = features.find(f => f.properties.totalDistance);
        if (summaryFeature) {
            const card = createRouteCard(summaryFeature, 0, mode);
            routeSidebar.appendChild(card);
        }
    }

    function createRouteCard(feature, index, mode) {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.dataset.index = index;

        const props = feature.properties;
        const durationInMinutes = Math.floor(props.totalTime / 60);
        const distanceInKm = (props.totalDistance / 1000).toFixed(1);

        let title = mode === 'driving' ? '자동차 경로' : '도보 경로';
        let metaInfoHtml = `${distanceInKm}km`;
        if (mode === 'driving' && props.taxiFare) {
            const fare = props.taxiFare.toLocaleString();
            metaInfoHtml += ` | 택시비 약 ${fare}원`;
        }

        card.innerHTML = `
            <div class="route-card-header">${title}</div>
            <div class="route-card-body">
                <span class="duration">${durationInMinutes}분</span>
                <span class="meta-info">${metaInfoHtml}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            routeSidebar.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
        return card;
    }

    function drawAllRoutes(features) {
        const bounds = new Tmapv2.LatLngBounds();

        features.forEach((feature) => {
            const geometry = feature.geometry;
            const pathPoints = [];

            // 타입이 LineString 또는 MultiLineString인 경우에만 경로를 그립니다.
            if (geometry.type === "LineString") {
                for (const coord of geometry.coordinates) {
                    const latlng = new Tmapv2.LatLng(coord[1], coord[0]);
                    pathPoints.push(latlng);
                    bounds.extend(latlng);
                }
            } else if (geometry.type === "MultiLineString") {
                for (const line of geometry.coordinates) {
                    for (const coord of line) {
                        const latlng = new Tmapv2.LatLng(coord[1], coord[0]);
                        pathPoints.push(latlng);
                        bounds.extend(latlng);
                    }
                }
            }

            if (pathPoints.length > 0) {
                 const polyline = new Tmapv2.Polyline({
                    path: pathPoints,
                    strokeColor: "#1B4373",
                    strokeWeight: 6,
                    map: map
                });
                routePolylines.push(polyline);
            }
        });

        if (startMarker && endMarker) {
             bounds.extend(startMarker.getPosition());
             bounds.extend(endMarker.getPosition());
        }

        if (bounds.getNorthEast()) {
            map.fitBounds(bounds);
        }
    }

    function clearMap() {
        if (startMarker) startMarker.setMap(null);
        if (endMarker) endMarker.setMap(null);
        routePolylines.forEach(p => p.setMap(null));
        routePolylines = [];
    }
});