/**
 * NEIS API를 활용한 스마일밀(급식 정보 조회) 웹 애플리케이션
 * 
 * [주의사항 - API 보안]
 * 프론트엔드 환경에서 외부 API를 호출할 때 API 인증키를 소스 코드 내에 하드코딩하면 
 * 외부에 키가 유출될 위험이 있습니다.
 * 실제 프로덕션 환경(실제 서비스)에서는 Node.js/Next.js 같은 서버사이드에서 API를 호출하고
 * 프론트엔드에서는 자체 서버 API를 호출하는 방식을 권장합니다.
 * 본 프로젝트는 학습 및 데모용이므로 NEIS 개방 API의 키 없는 버전을 사용합니다. (일일 1000회 제한)
 */

// --- 상수 및 데이터 ---
const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';

// 알레르기 유발 식품 정보 (NEIS 기준 1~19번)
const ALLERGY_INFO = {
    1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어', 
    8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류', 
    14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류', 19: '잣'
};

// 앱 상태 관리
const state = {
    currentDate: new Date(),
    schoolInfo: null, // { name: '', eduCode: '', schoolCode: '' }
    userAllergies: [] // [1, 2, 5, ...] (숫자 배열)
};

// --- DOM 요소 ---
const DOM = {
    // Header
    btnSearchSchool: document.getElementById('btnSearchSchool'),
    currentSchoolName: document.getElementById('currentSchoolName'),
    btnAllergySetting: document.getElementById('btnAllergySetting'),
    allergyActiveDot: document.getElementById('allergyActiveDot'),
    
    // Date Navigation
    displayDate: document.getElementById('displayDate'),
    btnPrevDay: document.getElementById('btnPrevDay'),
    btnNextDay: document.getElementById('btnNextDay'),
    btnGoToday: document.getElementById('btnGoToday'),
    datePicker: document.getElementById('datePicker'),
    
    // Meals Content
    mealsContainer: document.getElementById('mealsContainer'),
    mealCardTemplate: document.getElementById('mealCardTemplate'),
    
    // Modals
    modalOverlay: document.getElementById('modalOverlay'),
    schoolModal: document.getElementById('schoolModal'),
    allergyModal: document.getElementById('allergyModal'),
    closeBtns: document.querySelectorAll('.modal-close'),
    
    // School Search Modal
    schoolSearchForm: document.getElementById('schoolSearchForm'),
    schoolSearchInput: document.getElementById('schoolSearchInput'),
    schoolSearchResults: document.getElementById('schoolSearchResults'),
    
    // Allergy Modal
    allergyCheckboxes: document.getElementById('allergyCheckboxes'),
    btnSaveAllergy: document.getElementById('btnSaveAllergy'),
};

// --- 초기화 로직 ---
function init() {
    loadSettings();
    renderAllergyCheckboxes();
    updateDateDisplay();
    setupEventListeners();
    
    if (state.schoolInfo) {
        DOM.currentSchoolName.textContent = state.schoolInfo.name;
        fetchMealInfo();
    } else {
        showSchoolSearchPrompt();
    }
}

// --- 로컬 스토리지 연동 ---
function loadSettings() {
    const savedSchool = localStorage.getItem('smileMeal_school');
    if (savedSchool) {
        state.schoolInfo = JSON.parse(savedSchool);
    }
    
    const savedAllergies = localStorage.getItem('smileMeal_allergies');
    if (savedAllergies) {
        state.userAllergies = JSON.parse(savedAllergies);
    }
    updateAllergyDot();
}

function saveSchool(name, eduCode, schoolCode) {
    state.schoolInfo = { name, eduCode, schoolCode };
    localStorage.setItem('smileMeal_school', JSON.stringify(state.schoolInfo));
    DOM.currentSchoolName.textContent = name;
    closeModals();
    fetchMealInfo();
}

function saveAllergies() {
    const checkboxes = document.querySelectorAll('.allergy-checkbox-input:checked');
    state.userAllergies = Array.from(checkboxes).map(cb => parseInt(cb.value));
    localStorage.setItem('smileMeal_allergies', JSON.stringify(state.userAllergies));
    updateAllergyDot();
    closeModals();
    // 설정 변경 시 급식 정보 재렌더링
    if (state.schoolInfo) {
        fetchMealInfo();
    }
}

function updateAllergyDot() {
    if (state.userAllergies.length > 0) {
        DOM.allergyActiveDot.classList.remove('hidden');
    } else {
        DOM.allergyActiveDot.classList.add('hidden');
    }
}

// --- 이벤트 리스너 설정 ---
function setupEventListeners() {
    // 날짜 네비게이션
    DOM.btnPrevDay.addEventListener('click', () => changeDate(-1));
    DOM.btnNextDay.addEventListener('click', () => changeDate(1));
    DOM.btnGoToday.addEventListener('click', () => {
        state.currentDate = new Date();
        updateDateDisplay();
        if (state.schoolInfo) fetchMealInfo();
    });
    
    // 데이트 피커(기본 달력 UI 연동)
    DOM.datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
            state.currentDate = new Date(e.target.value);
            updateDateDisplay();
            if (state.schoolInfo) fetchMealInfo();
        }
    });

    // 모달 열기
    DOM.btnSearchSchool.addEventListener('click', () => openModal(DOM.schoolModal));
    DOM.btnAllergySetting.addEventListener('click', () => {
        // 모달 열 때 현재 설정된 알레르기 체크박스 동기화
        const checkboxes = document.querySelectorAll('.allergy-checkbox-input');
        checkboxes.forEach(cb => {
            cb.checked = state.userAllergies.includes(parseInt(cb.value));
        });
        openModal(DOM.allergyModal);
    });

    // 모달 닫기
    DOM.closeBtns.forEach(btn => btn.addEventListener('click', closeModals));
    DOM.modalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.modalOverlay) closeModals();
    });

    // 학교 검색
    DOM.schoolSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = DOM.schoolSearchInput.value.trim();
        if (query) {
            await searchSchool(query);
        }
    });

    // 알레르기 저장
    DOM.btnSaveAllergy.addEventListener('click', saveAllergies);
}

// --- 날짜 관련 유틸리티 ---
function changeDate(days) {
    state.currentDate.setDate(state.currentDate.getDate() + days);
    updateDateDisplay();
    if (state.schoolInfo) fetchMealInfo();
}

function updateDateDisplay() {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const year = state.currentDate.getFullYear();
    const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
    const date = String(state.currentDate.getDate()).padStart(2, '0');
    const day = days[state.currentDate.getDay()];
    
    DOM.displayDate.textContent = `${year}. ${month}. ${date} (${day})`;
    DOM.datePicker.value = `${year}-${month}-${date}`;
}

function getFormattedDateForAPI() {
    const year = state.currentDate.getFullYear();
    const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
    const date = String(state.currentDate.getDate()).padStart(2, '0');
    return `${year}${month}${date}`;
}

// --- UI / 모달 제어 ---
function openModal(modalEl) {
    DOM.modalOverlay.classList.remove('hidden');
    // 브라우저 렌더링 타이밍을 위해 약간의 지연
    setTimeout(() => {
        DOM.modalOverlay.classList.add('modal-active');
        modalEl.classList.remove('hidden');
        if (modalEl === DOM.schoolModal) {
            DOM.schoolSearchInput.focus();
        }
    }, 10);
}

function closeModals() {
    DOM.modalOverlay.classList.remove('modal-active');
    setTimeout(() => {
        DOM.modalOverlay.classList.add('hidden');
        DOM.schoolModal.classList.add('hidden');
        DOM.allergyModal.classList.add('hidden');
    }, 300); // CSS transition 시간과 동일하게
}

function renderAllergyCheckboxes() {
    DOM.allergyCheckboxes.innerHTML = '';
    for (const [key, name] of Object.entries(ALLERGY_INFO)) {
        const id = `allergy_${key}`;
        const html = `
            <label class="allergy-checkbox-wrapper group">
                <input type="checkbox" id="${id}" value="${key}" class="allergy-checkbox-input">
                <div class="allergy-checkbox-content flex items-center gap-2 p-3 sm:p-4 rounded-2xl">
                    <span class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:bg-slate-200 transition-colors">${key}</span>
                    <span class="font-medium text-slate-700">${name}</span>
                </div>
            </label>
        `;
        DOM.allergyCheckboxes.insertAdjacentHTML('beforeend', html);
    }
}

// --- API 호출 및 비즈니스 로직 ---

// 학교 검색 (학교기본정보 API)
async function searchSchool(schoolName) {
    DOM.schoolSearchResults.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 space-y-4">
            <i class="ph-bold ph-spinner animate-spin text-4xl text-blue-500"></i>
            <p class="text-slate-500 font-medium text-sm">학교를 검색하고 있어요...</p>
        </div>
    `;
    
    try {
        const url = `${NEIS_BASE_URL}/schoolInfo?Type=json&pIndex=1&pSize=50&SCHUL_NM=${encodeURIComponent(schoolName)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.RESULT && data.RESULT.CODE !== 'INFO-000') {
            throw new Error(data.RESULT.MESSAGE);
        }
        
        if (!data.schoolInfo || data.schoolInfo[1].row.length === 0) {
            DOM.schoolSearchResults.innerHTML = `<div class="text-center text-slate-500 py-8">검색 결과가 없습니다.</div>`;
            return;
        }

        const schools = data.schoolInfo[1].row;
        renderSchoolResults(schools);
        
    } catch (error) {
        console.error('학교 검색 오류:', error);
        DOM.schoolSearchResults.innerHTML = `<div class="text-center text-red-500 py-8">검색 중 오류가 발생했습니다.<br>잠시 후 다시 시도해주세요.</div>`;
    }
}

function renderSchoolResults(schools) {
    DOM.schoolSearchResults.innerHTML = '';
    
    schools.forEach(school => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-white border border-slate-200 rounded-2xl hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all flex flex-col gap-1 active:scale-95 group';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">${school.SCHUL_NM}</h3>
                <span class="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">${school.LCTN_SC_NM}</span>
            </div>
            <p class="text-sm text-slate-500 mt-1 flex items-center gap-1"><i class="ph-fill ph-map-pin text-slate-400"></i> ${school.ORG_RDNMA}</p>
        `;
        
        div.addEventListener('click', () => {
            saveSchool(school.SCHUL_NM, school.ATPT_OFCDC_SC_CODE, school.SD_SCHUL_CODE);
        });
        
        DOM.schoolSearchResults.appendChild(div);
    });
}

// 급식 정보 조회
async function fetchMealInfo() {
    showLoadingSkeleton();
    
    const eduCode = state.schoolInfo.eduCode;
    const schoolCode = state.schoolInfo.schoolCode;
    const dateStr = getFormattedDateForAPI();
    
    try {
        const url = `${NEIS_BASE_URL}/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=${eduCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${dateStr}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.RESULT && data.RESULT.CODE !== 'INFO-000') {
            // 정보가 없는 경우 (주말, 휴일 등)
            renderEmptyMeals("오늘은 급식 정보가 없습니다. 🍙");
            return;
        }
        
        if (!data.mealServiceDietInfo) {
            renderEmptyMeals("오늘은 급식 정보가 없습니다. 🍙");
            return;
        }

        const meals = data.mealServiceDietInfo[1].row;
        renderMeals(meals);
        
    } catch (error) {
        console.error('급식 정보 조회 오류:', error);
        renderEmptyMeals("급식 정보를 불러오는 중 오류가 발생했습니다. 🥲");
    }
}

// --- 렌더링 로직 ---

function showSchoolSearchPrompt() {
    DOM.mealsContainer.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center p-12 glass-card rounded-3xl text-center">
            <div class="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <i class="ph-fill ph-buildings text-5xl text-blue-500"></i>
            </div>
            <h3 class="text-2xl font-bold text-slate-800 mb-2">어느 학교의 급식이 궁금하신가요?</h3>
            <p class="text-slate-500 mb-8 max-w-md leading-relaxed">위쪽의 돋보기 아이콘을 눌러 학교를 설정하면 매일 맛있는 급식 정보를 알려드릴게요!</p>
            <button onclick="document.getElementById('btnSearchSchool').click()" class="bg-gradient-to-r from-blue-500 to-pink-500 text-white font-bold px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">
                학교 검색하기
            </button>
        </div>
    `;
}

function showLoadingSkeleton() {
    const skeletonHTML = Array(3).fill(`
        <div class="glass-card p-6 sm:p-8 rounded-3xl flex flex-col gap-4 animate-pulse h-96 border border-white/60 shadow-sm">
            <div class="flex justify-between items-center mb-4">
                <div class="h-8 bg-slate-200/60 rounded-xl w-24"></div>
                <div class="h-6 bg-slate-200/60 rounded-xl w-16"></div>
            </div>
            <div class="space-y-4 flex-1">
                <div class="h-5 bg-slate-200/60 rounded-lg w-full"></div>
                <div class="h-5 bg-slate-200/60 rounded-lg w-5/6"></div>
                <div class="h-5 bg-slate-200/60 rounded-lg w-4/6"></div>
                <div class="h-5 bg-slate-200/60 rounded-lg w-full"></div>
                <div class="h-5 bg-slate-200/60 rounded-lg w-3/4"></div>
            </div>
            <div class="pt-4 border-t border-slate-200/50">
                <div class="h-16 bg-slate-200/60 rounded-xl w-full"></div>
            </div>
        </div>
    `).join('');
    DOM.mealsContainer.innerHTML = skeletonHTML;
}

function renderEmptyMeals(message) {
    DOM.mealsContainer.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center p-16 glass-card rounded-3xl text-center shadow-sm">
            <span class="text-6xl mb-6 grayscale opacity-60 filter">🍙</span>
            <p class="text-xl font-bold text-slate-500">${message}</p>
        </div>
    `;
}

function renderMeals(meals) {
    DOM.mealsContainer.innerHTML = '';
    
    // 조식, 중식, 석식 순서 정렬을 위한 기본 구조
    const mealTypes = ['조식', '중식', '석식'];
    const mealIcons = { '조식': 'ph-sun-horizon', '중식': 'ph-sun', '석식': 'ph-moon-stars' };
    const mealColors = { '조식': 'text-orange-500', '중식': 'text-amber-500', '석식': 'text-indigo-500' };
    
    // 존재하는 급식 데이터 매핑
    const mealMap = {};
    meals.forEach(meal => {
        mealMap[meal.MMEAL_SC_NM] = meal;
    });
    
    // 렌더링
    mealTypes.forEach((type, index) => {
        const mealData = mealMap[type];
        if (mealData) {
            const template = DOM.mealCardTemplate.content.cloneNode(true);
            const card = template.querySelector('.glass-card');
            
            // 타이틀 및 아이콘 설정
            const titleEl = card.querySelector('.meal-type-title');
            titleEl.innerHTML = `
                <i class="ph-fill ${mealIcons[type]} ${mealColors[type]} text-2xl"></i>
                ${type}
            `;
            
            // 칼로리 설정
            card.querySelector('.meal-kcal').textContent = mealData.CAL_INFO;
            
            // 메뉴 파싱 및 렌더링
            const dishesContainer = card.querySelector('.meal-dishes');
            const parsedDishes = parseDishes(mealData.DDISH_NM);
            
            parsedDishes.forEach((dish, idx) => {
                const dishDiv = document.createElement('div');
                dishDiv.className = `dish-item p-3 sm:p-4 rounded-2xl flex flex-col bg-white/60 border border-white shadow-sm`;
                dishDiv.style.animationDelay = `${(idx * 0.05) + (index * 0.1)}s`;
                
                // 알레르기 포함 여부 체크
                const hasWarning = dish.allergies.some(num => state.userAllergies.includes(parseInt(num)));
                if (hasWarning) {
                    dishDiv.classList.add('allergy-warning');
                }
                
                const dishNameSpan = document.createElement('span');
                dishNameSpan.className = `font-bold text-lg sm:text-xl ${hasWarning ? 'allergy-warning-text' : 'text-slate-800'}`;
                dishNameSpan.textContent = dish.name;
                
                dishDiv.appendChild(dishNameSpan);
                
                // 알레르기 뱃지 렌더링
                if (dish.allergies.length > 0) {
                    const badgeContainer = document.createElement('div');
                    badgeContainer.className = 'flex flex-wrap gap-1 mt-2';
                    
                    dish.allergies.forEach(num => {
                        const isWarn = state.userAllergies.includes(parseInt(num));
                        const badge = document.createElement('span');
                        badge.className = `text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isWarn ? 'bg-pink-100 text-pink-600 border border-pink-200' : 'bg-slate-200/80 text-slate-500'
                        }`;
                        // 숫자를 이름으로 변환해서 보여줌
                        badge.textContent = ALLERGY_INFO[num] || num;
                        badgeContainer.appendChild(badge);
                    });
                    dishDiv.appendChild(badgeContainer);
                }
                
                dishesContainer.appendChild(dishDiv);
            });
            
            // 영양 정보 정리 (불필요한 공백 제거)
            const nutritionText = mealData.NTR_INFO.replace(/<br\/>/g, ' / ').replace(/\s+/g, ' ');
            card.querySelector('.meal-nutrients').textContent = nutritionText;
            
            DOM.mealsContainer.appendChild(template);
        }
    });
    
    // 만약 데이터는 배열로 왔는데 매핑된 조,중,석식이 없다면 예외처리
    if (DOM.mealsContainer.children.length === 0) {
        renderEmptyMeals("등록된 급식 식단이 없습니다. 🍙");
    }
}

// --- 데이터 파싱 로직 ---
/**
 * NEIS 식단 문자열 파싱
 * 예: "보리밥<br/>부대찌개(1.2.5.6)<br/>탕수육(1.5.6.10)"
 * 반환: [{ name: "보리밥", allergies: [] }, { name: "부대찌개", allergies: ["1","2","5","6"] }]
 */
function parseDishes(ddishNm) {
    // 1. <br/> 단위로 분리
    const items = ddishNm.split(/<br\/>|<br>/);
    const parsed = [];
    
    // 2. 정규식을 통해 요리명과 알레르기 번호 괄호 분리
    // 매칭 그룹 1: 요리명 (괄호 이전 내용)
    // 매칭 그룹 2: 전체 괄호 포함 문자열 "(1.2.5.6)" (옵셔널)
    // 매칭 그룹 3: 괄호 안의 숫자들 "1.2.5.6"
    const regex = /^(.*?)(\(([\d\.]+)\))?(\s*\*+)?$/; // 끝에 붙는 별표(*) 무시용 처리 추가
    
    items.forEach(item => {
        if (!item.trim()) return;
        
        // 정규식 실행 전 불필요한 별표 등 꼬리표 제거 (NEIS 데이터에는 * 표시가 붙는 경우가 있음)
        const cleanItem = item.trim().replace(/\*+/g, '');
        const match = cleanItem.match(regex);
        
        if (match) {
            const name = match[1].trim();
            const allergyStr = match[3] || '';
            const allergies = allergyStr ? allergyStr.split('.').filter(n => n.trim() !== '') : [];
            
            parsed.push({
                name,
                allergies
            });
        } else {
            // 매칭 안될 시 원본 유지
            parsed.push({ name: cleanItem, allergies: [] });
        }
    });
    
    return parsed;
}

// 앱 실행
document.addEventListener('DOMContentLoaded', init);
