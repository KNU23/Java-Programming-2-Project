document.addEventListener('DOMContentLoaded', () => {
    // 1. 지도의 기본 옵션 설정 (서울 시청을 기본 중심으로)
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780), // 기본 중심 좌표 (서울 시청)
        zoom: 15,
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: naver.maps.MapTypeControlStyle.BUTTON,
            position: naver.maps.Position.TOP_RIGHT
        }
    };

    // 2. 지도 생성
    const map = new naver.maps.Map('map', mapOptions);

    // 3. 현재 위치 가져오기
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(onSuccessGeolocation, onErrorGeolocation);
    } else {
        console.log("Geolocation is not supported by this browser.");
        // 기본 위치에 마커 표시
        initializeMarker(map.getCenter());
    }

    // 4. 위치 정보 가져오기 성공 시 실행될 함수
    function onSuccessGeolocation(position) {
        // 현재 위치 좌표 객체 생성
        const currentLocation = new naver.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
        );

        // 지도의 중심을 현재 위치로 이동
        map.setCenter(currentLocation);
        map.setZoom(16); // 확대 수준을 조금 더 높임

        // 현재 위치에 마커 표시
        initializeMarker(currentLocation);
    }

    // 5. 위치 정보 가져오기 실패 시 실행될 함수
    function onErrorGeolocation() {
        console.log("Could not get location information.");
        // 기본 위치에 마커 표시
        initializeMarker(map.getCenter());
    }

    // 6. 마커와 정보창을 초기화하는 함수
    function initializeMarker(location) {
        const marker = new naver.maps.Marker({
            position: location,
            map: map
        });

        const infoWindow = new naver.maps.InfoWindow({
            content: '<div style="padding:10px; text-align: center;"><b>현재 위치</b></div>',
            backgroundColor: "#fff",
            borderColor: "#2DB400",
            borderWidth: 2,
            anchorSize: new naver.maps.Size(15, 8),
            pixelOffset: new naver.maps.Point(0, -15)
        });

        naver.maps.Event.addListener(marker, 'click', () => {
            if (infoWindow.getMap()) {
                infoWindow.close();
            } else {
                infoWindow.open(map, marker);
            }
        });
        
        // 처음 로드 시 정보창 열기
        infoWindow.open(map, marker);
    }
});