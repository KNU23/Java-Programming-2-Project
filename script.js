// [신규] 페이지가 로드될 때 결과 페이지를 먼저 숨깁니다.
const resultsPage = document.getElementById('results-page');
resultsPage.style.display = 'none';

// 이동 수단 버튼 클릭 시 'active' 클래스 관리
const modeButtons = document.querySelectorAll('.mode-selector button');

modeButtons.forEach(button => {
    button.addEventListener('click', () => {
        // hero-section과 results-page의 버튼들을 모두 포함하여 처리
        const allButtons = document.querySelectorAll(`.mode-selector button[id*="${button.id.split('-')[1]}"]`);
        document.querySelectorAll('.mode-selector button').forEach(btn => btn.classList.remove('active'));
        allButtons.forEach(btn => btn.classList.add('active'));
    });
});

// 오늘 날짜와 현재 시간을 기본값으로 설정
const now = new Date();
const year = now.getFullYear();
const month = (now.getMonth() + 1).toString().padStart(2, '0');
const day = now.getDate().toString().padStart(2, '0');
const hours = now.getHours().toString().padStart(2, '0');
const minutes = now.getMinutes().toString().padStart(2, '0');

document.getElementById('arrival-date-hero').value = `${year}-${month}-${day}`;
document.getElementById('arrival-time-hero').value = `${hours}:${minutes}`;

// On/Off 스위치 기능 설정
function setupSwitch(switchId) {
    const switchContainer = document.getElementById(switchId);
    if (switchContainer) {
        const buttons = switchContainer.querySelectorAll('.switch-btn');
        const input = switchContainer.closest('.input-group').querySelector('input');
        const inputWrapper = switchContainer.closest('.input-group').querySelector('.input-field-wrapper');

        buttons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const isOff = button.dataset.value === 'off';
                input.disabled = isOff;
                if (!isOff) input.focus();
            });
        });

        if (inputWrapper) {
            inputWrapper.addEventListener('mousedown', (event) => {
                if (event.target !== input) event.preventDefault();
                const onButton = switchContainer.querySelector('.switch-btn[data-value="on"]');
                const offButton = switchContainer.querySelector('.switch-btn[data-value="off"]');
                
                if (offButton.classList.contains('active')) {
                    onButton.classList.add('active');
                    offButton.classList.remove('active');
                    input.disabled = false;
                }
                setTimeout(() => input.focus(), 0);
            });
        }
    }
}

setupSwitch('date-switch-hero');
setupSwitch('time-switch-hero');


// --- 화면 스크롤 기능 ---
const heroForm = document.getElementById('hero-form');

// 결과 페이지의 입력 필드
const startPointHeader = document.getElementById('start-point-header');
const endPointHeader = document.getElementById('end-point-header');
const arrivalDateHeader = document.getElementById('arrival-date-header');
const arrivalTimeHeader = document.getElementById('arrival-time-header');

let map = null; // 지도 객체를 전역에서 관리

// 네이버 지도 API가 준비되면 호출될 함수
function initMap() {
    console.log("Map API is ready. Map will be initialized after search.");
}

heroForm.addEventListener('submit', (event) => {
    event.preventDefault(); // 폼의 기본 제출 동작 방지

    // 1. 시작 화면의 입력값을 가져와 결과 화면 헤더에 복사
    startPointHeader.value = document.getElementById('start-point-hero').value;
    endPointHeader.value = document.getElementById('end-point-hero').value;
    arrivalDateHeader.value = document.getElementById('arrival-date-hero').value;
    arrivalTimeHeader.value = document.getElementById('arrival-time-hero').value;

    // 2. [수정됨] 결과 페이지를 보이게 하고 부드럽게 스크롤
    resultsPage.style.display = 'flex';
    resultsPage.scrollIntoView({ behavior: 'smooth' });

    // 3. 지도 초기화 및 렌더링
    if (!map) { // 지도가 아직 생성되지 않았다면
        map = new naver.maps.Map('map', {
            center: new naver.maps.LatLng(37.5665, 126.9780), // 서울 시청
            zoom: 16,
            // 기타 옵션
        });
    } else {
        // 이미 지도가 있다면, 크기가 변경되었을 수 있으므로 새로고침
        map.refresh();
    }

    // 4. TODO: 이 위치에서 실제 길찾기 로직(API 호출)을 실행합니다.
    console.log("Perform route search now...");
});

