// index.html을 위한 스크립트

// Google Places Autocomplete 초기화
function initAutocomplete() {
    const startInput = document.getElementById('start-point-hero');
    const endInput = document.getElementById('end-point-hero');
    new google.maps.places.Autocomplete(startInput);
    new google.maps.places.Autocomplete(endInput);
}

// [수정된 함수] On/Off 스위치 설정 함수
function setupSwitch(switchId) {
    const switchContainer = document.getElementById(switchId);
    if (!switchContainer) return;

    const buttons = switchContainer.querySelectorAll('.switch-btn');
    const inputGroup = switchContainer.closest('.input-group');
    const input = inputGroup.querySelector('input');
    const label = inputGroup.querySelector('label'); // 라벨을 변경하기 위해 선택

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // 1. 버튼 UI 업데이트
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const isOff = button.dataset.value === 'off';

            // 2. 'off' 상태일 때 입력창을 비활성화
            input.disabled = isOff;

            // 3. 스위치별 특별 기능 추가
            if (isOff) {
                // 'off' 버튼을 눌렀을 때의 동작
                const now = new Date();
                if (switchId === 'date-switch-hero') {
                    // '가는 날짜'를 오늘 날짜로 설정
                    const year = now.getFullYear();
                    const month = (now.getMonth() + 1).toString().padStart(2, '0');
                    const day = now.getDate().toString().padStart(2, '0');
                    input.value = `${year}-${month}-${day}`;
                } else if (switchId === 'time-switch-hero') {
                    // '도착 시간'을 '출발 시간'으로 바꾸고 현재 시간으로 설정
                    const hours = now.getHours().toString().padStart(2, '0');
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    input.value = `${hours}:${minutes}`;
                    if (label) {
                        label.textContent = '출발 시간'; // 라벨 텍스트 변경
                    }
                }
            } else {
                // 'on' 버튼을 눌렀을 때의 동작
                if (switchId === 'time-switch-hero') {
                    // 라벨을 다시 '도착 시간'으로 복원
                    if (label) {
                        label.textContent = '도착 시간';
                    }
                }
            }
        });
    });
}

// 페이지 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', () => {

    checkLoginStatus();
    // 1. 이동 수단 버튼 설정
    const modeButtons = document.querySelectorAll('.mode-selector .transport-mode');
    const hiddenModeInput = document.getElementById('transport-mode');

    modeButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault(); // form 제출 방지
            modeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            hiddenModeInput.value = button.dataset.mode;
        });
    });

    // 2. 날짜/시간 기본값 설정
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    document.getElementById('arrival-date-hero').value = `${year}-${month}-${day}`;
    document.getElementById('arrival-time-hero').value = `${hours}:${minutes}`;

    // 3. On/Off 스위치 활성화 (수정된 함수 호출)
    setupSwitch('date-switch-hero');
    setupSwitch('time-switch-hero');

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
            // 에러 시 로그아웃 상태 UI 표시
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
            // (필요 시 .logout-link에 CSS 스타일 추가)

        } else {
            // [로그아웃된 상태] 카카오 로그인 버튼 표시
            container.innerHTML = `
                <a href="#" id="kakao-login-btn">
                    <i class="fa-solid fa-circle-user"></i>
                    <span>로그인</span>
                </a>
            `;
            
            // 카카오 로그인 버튼에 클릭 이벤트 추가
            const loginBtn = document.getElementById('kakao-login-btn');
            if (loginBtn) {
                loginBtn.addEventListener('click', onKakaoLoginClick);
            }
        }
    }

    /**
     * 카카오 로그인 버튼 클릭 시 실행되는 함수
     */
    async function onKakaoLoginClick(e) {
        e.preventDefault();
        try {
            // 1. 서버에서 카카오 설정값(API 키, Redirect URI)을 가져옵니다.
            const configRes = await fetch('/api/auth/kakao/config');
            const config = await configRes.json();

            // 2. 카카오 로그인 페이지로 리디렉션합니다.
            const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${config.restApiKey}&redirect_uri=${config.redirectUri}&response_type=code&prompt=login`;            
            window.location.href = kakaoAuthUrl;
        } catch (error) {
            console.error('카카오 로그인 설정 실패:', error);
            alert('로그인 처리 중 오류가 발생했습니다.');
        }
    }