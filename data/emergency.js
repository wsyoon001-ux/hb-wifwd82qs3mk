// 비상 정보 카드(앱 내장). 공개 저장소에 올라가므로 이미 공개된 것만 둔다.
// 여권·eTA·집 주소·PNR·에어비앤비 확인 코드·Radisson 예약번호는 여기 넣지 않는다 —
// 폰마다 직접 입력해 그 폰에만 저장한다(src/emergency-store.js).

export const FLIGHTS = [
  { date: '10/09', no: 'AC064', from: '인천 T1', dep: '17:45', to: '밴쿠버', arr: '11:30' },
  { date: '10/12', no: 'AC8024', from: '밴쿠버', dep: '13:40', to: '옐로나이프', arr: '17:06' },
  { date: '10/15', no: '4N880 (에어노스)', from: '옐로나이프', dep: '19:15', to: '밴쿠버', arr: '20:50' },
  { date: '10/16', no: 'AC063', from: '밴쿠버', dep: '12:20', to: '인천', arr: '10/17 16:05' },
];

export const LODGING = [
  {
    when: '10/09~12', name: 'Century Plaza Hotel',
    address: '1015 Burrard St, Vancouver, BC V6Z 1Y5',
    tel: { value: '+1 604-687-0575', href: '+16046870575' },
    ref: { label: '아고다 예약번호', value: '1767601052' },
  },
  {
    when: '10/12~15', name: 'Airbnb Cozy Frame Lake Suite',
    address: '4811 Matonabee St, Yellowknife, NT X1A 2H3',
    note: '호스트 Jeremy — 연락은 에어비앤비 앱 메시지',
  },
  {
    when: '10/15~16', name: 'Radisson Blu Vancouver Airport',
    address: '3500 Cessna Dr, Richmond, BC V7B 1C7',
    tel: { value: '+1 604-278-1241', href: '+16042781241' },
    note: '후불 CA$245.30',
  },
];

export const AURORA = {
  name: 'Arctic Tours Canada',
  ref: { label: '구매번호', value: 'RNVX1WB' },
  pickup: { name: '픽업 Capital Suites', address: '5603 50th Ave, Yellowknife' },
  tel: { label: '긴급', value: '867-446-7335', href: '+18674467335' },
};

export const CALLS = [
  { label: '긴급 (경찰·구급·소방)', value: '911', href: '911' },
  { label: '주밴쿠버 총영사관', value: '+1 604-681-9581', href: '+16046819581' },
  { label: '영사안전콜센터 (24시간)', value: '+82 2-3210-0404', href: '+82232100404' },
  { label: '택시 City Cab (옐로나이프)', value: '867-873-4444', href: '+18678734444' },
  { label: '택시 Yellowknife Taxi', value: '867-873-6666', href: '+18678736666' },
  { label: '택시 Aurora Taxi', value: '867-873-5050', href: '+18678735050' },
];
