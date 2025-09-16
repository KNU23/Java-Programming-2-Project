document.addEventListener('DOMContentLoaded', () => {
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 15,
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: naver.maps.MapTypeControlStyle.BUTTON,
            position: naver.maps.Position.TOP_RIGHT
        }
    };

    const map = new naver.maps.Map('map', mapOptions);

    if (navigator.geolocation) {
        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
        navigator.geolocation.getCurrentPosition(onSuccessGeolocation, onErrorGeolocation, geoOptions);
    } else {
        console.log("Geolocation is not supported by this browser.");
        initializeMarker(map.getCenter());
    }

    function onSuccessGeolocation(position) {
        const currentLocation = new naver.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
        );
        map.setCenter(currentLocation);
        map.setZoom(16);
        initializeMarker(currentLocation);
    }

    function onErrorGeolocation(error) {
        // 타임아웃 발생 시 에러 코드는 3입니다.
        console.error("Could not get location information.", error);
        initializeMarker(map.getCenter());
    }

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
        infoWindow.open(map, marker);
    }
});