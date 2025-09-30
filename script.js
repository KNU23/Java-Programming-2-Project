document.addEventListener('DOMContentLoaded', () => {
    // API 요청을 보낼 프록시 서버의 주소
    const proxyServerUrl = 'http://localhost:3000';

    // 네이버 지도 초기화
    const map = new naver.maps.Map('map', { 
        center: new naver.maps.LatLng(37.5665, 126.9780), 
        zoom: 15 
    });
    
    // 지도 위에 표시될 요소들을 저장할 변수
    let startMarker = null, goalMarker = null, routePolyline = null;
    
    // HTML 요소 선택
    const startInput = document.getElementById('start-input');
    const goalInput = document.getElementById('goal-input');
    const searchButton = document.getElementById('search-button');
    const startResults = document.getElementById('start-results');
    const goalResults = document.getElementById('goal-results');

    // --- 자동완성 기능 ---

    // Debounce: 입력이 끝난 후 일정 시간 뒤에 함수를 실행하여 불필요한 API 호출 방지
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // 장소 검색 API 호출 함수
    const fetchSearchResults = async (query, resultsContainer) => {
        if (!query) {
            resultsContainer.innerHTML = '';
            resultsContainer.style.display = 'none';
            return;
        }
        try {
            const response = await fetch(`${proxyServerUrl}/api/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            displayResults(data.items || [], resultsContainer);
        } catch (error) {
            console.error("Search API fetch error:", error);
        }
    };

    // 검색 결과를 목록으로 화면에 표시하는 함수
    const displayResults = (items, resultsContainer) => {
        resultsContainer.innerHTML = '';
        if (items.length > 0) {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                const cleanTitle = item.title.replace(/<[^>]*>?/g, ''); // <b> 태그 제거
                div.innerHTML = `<div class="item-title">${cleanTitle}</div><div class="item-address">${item.address}</div>`;
                
                div.addEventListener('click', () => {
                    if (resultsContainer.id === 'start-results') {
                        startInput.value = cleanTitle;
                    } else {
                        goalInput.value = cleanTitle;
                    }
                    resultsContainer.style.display = 'none';
                });
                resultsContainer.appendChild(div);
            });
            resultsContainer.style.display = 'block';
        } else {
            resultsContainer.style.display = 'none';
        }
    };

    // 각 입력창에 'input' 이벤트 리스너 연결
    startInput.addEventListener('input', debounce(() => fetchSearchResults(startInput.value, startResults), 300));
    goalInput.addEventListener('input', debounce(() => fetchSearchResults(goalInput.value, goalResults), 300));
    
    // 다른 곳을 클릭하면 자동완성 창 닫기
    document.addEventListener('click', (e) => {
        if (!startInput.contains(e.target)) startResults.style.display = 'none';
        if (!goalInput.contains(e.target)) goalResults.style.display = 'none';
    });


    // --- 길찾기 기능 ---

    // 현재 위치 가져와서 출발지 자동 완성
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(onSuccessGeolocation, onErrorGeolocation, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }
    
    async function onSuccessGeolocation(position) {
        const location = new naver.maps.LatLng(position.coords.latitude, position.coords.longitude);
        map.setCenter(location);
        const address = await reverseGeocodeCoords(location);
        if (address) startInput.value = address;
    }

    function onErrorGeolocation(error) { 
        console.error("Could not get location information.", error); 
    }

    // 길찾기 버튼 및 엔터 키 이벤트 리스너
    searchButton.addEventListener('click', findAndDrawRoute);
    startInput.addEventListener('keydown', (e) => e.key === 'Enter' && findAndDrawRoute());
    goalInput.addEventListener('keydown', (e) => e.key === 'Enter' && findAndDrawRoute());

    // 길찾기 메인 로직
    async function findAndDrawRoute() {
        const startQuery = startInput.value;
        const goalQuery = goalInput.value;
        if (!startQuery || !goalQuery) { 
            alert('출발지와 목적지를 모두 입력해주세요.'); 
            return; 
        }
        try {
            const [startCoords, goalCoords] = await Promise.all([geocodeAddress(startQuery), geocodeAddress(goalQuery)]);
            if (!startCoords || !goalCoords) return;

            const routePath = await getDirections(startCoords, goalCoords);
            if (!routePath) return;
            
            drawRoute(startCoords, goalCoords, routePath);
        } catch (error) { 
            console.error('길찾기 과정에서 오류 발생:', error); 
            alert('경로를 찾는 데 실패했습니다.'); 
        }
    }

    // 좌표 -> 주소 변환 (Reverse Geocoding)
    async function reverseGeocodeCoords(coords) {
        const apiUrl = `${proxyServerUrl}/api/reverse-geocode?coords=${coords.lng()},${coords.lat()}`;
        try {
            const response = await fetch(apiUrl);
            const data = await response.json();
            if (data.status && data.status.code === 0 && data.results.length > 0) {
                return data.results[0].region.area1.name + ' ' + data.results[0].region.area2.name + ' ' + (data.results[0].land.name || '');
            }
        } catch (error) { 
            console.error('Reverse Geocoding 실패:', error); 
        }
        return null;
    }

    // 주소 -> 좌표 변환 (Geocoding)
    async function geocodeAddress(address) {
        const apiUrl = `${proxyServerUrl}/api/geocode?query=${encodeURIComponent(address)}`;
        try {
            const response = await fetch(apiUrl);
            const data = await response.json();
            if (data.status !== 'OK' || data.addresses.length === 0) { 
                alert(`'${address}' 주소를 찾을 수 없습니다.`); 
                return null; 
            }
            return new naver.maps.LatLng(data.addresses[0].y, data.addresses[0].x);
        } catch (error) { 
            console.error('지오코딩 실패:', error); 
            return null; 
        }
    }

    // 길찾기 API 호출
    async function getDirections(start, goal) {
        const startPoint = `${start.lng()},${start.lat()}`;
        const goalPoint = `${goal.lng()},${goal.lat()}`;
        const apiUrl = `${proxyServerUrl}/api/directions?start=${startPoint}&goal=${goalPoint}`;
        try {
            const response = await fetch(apiUrl);
            const data = await response.json();
            if (data.code !== 0) { 
                alert('길찾기 실패: ' + data.message); 
                return null; 
            }
            return data.route.trafast[0].path.map(point => new naver.maps.LatLng(point[1], point[0]));
        } catch (error) { 
            console.error('Directions API 호출 실패:', error); 
            return null; 
        }
    }
    
    // 지도에 경로와 마커 그리기
    function drawRoute(start, goal, path) {
        if (startMarker) startMarker.setMap(null);
        if (goalMarker) goalMarker.setMap(null);
        if (routePolyline) routePolyline.setMap(null);
        
        startMarker = new naver.maps.Marker({ position: start, map: map, icon: { content: '<div class="marker start"></div>', anchor: new naver.maps.Point(10, 10) } });
        goalMarker = new naver.maps.Marker({ position: goal, map: map, icon: { content: '<div class="marker goal"></div>', anchor: new naver.maps.Point(10, 10) } });
        
        routePolyline = new naver.maps.Polyline({ path: path, strokeColor: '#2DB400', strokeOpacity: 0.8, strokeWeight: 6, map: map });
        
        const bounds = new naver.maps.LatLngBounds(start, goal);
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 430 });
    }
});