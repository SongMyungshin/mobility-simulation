/* global window */
// Trip.js - 여행 경로(Trip)의 지도상 시각화 및 슬라이더 기반 애니메이션 제어 컴포넌트

import React, { useState, useEffect, useCallback } from "react";

import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl';

import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers';

import Slider from "@mui/material/Slider";
import "../css/trip.css";

/* 
  Light 효과 정의: 지도 위 객체들이 더 입체적으로 보이도록 조명 효과를 지정 
*/
const ambientLight = new AmbientLight({
  color: [255, 255, 255],    // 환경광 색상
  intensity: 1.0             // 밝기
});

// PointLight는 특정 위치에서 나오는 조명 효과
const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000] // 위도, 경도, 높이
});

// 위의 ambientLight와 pointLight를 합친 조명 효과
const lightingEffect = new LightingEffect({ ambientLight, pointLight });

/*
  material: 3D 객체 표면의 반사/질감 효과 정보
*/
const material = {
  ambient: 0.1,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [60, 64, 70]
};

const material2 = {
  ambient: 0.3,
  diffuse: 0.6,
  shininess: 32,
  specularCol: [60, 64, 70]
};

// theme 스타일 preset
const DEFAULT_THEME = {
  buildingColor: [228, 228, 228],
  buildingColor2: [255, 255, 255],
  trailColor0: [253, 128, 93],
  trailColor1: [23, 184, 190],
  material,
  material2,
  effects: [lightingEffect]
};

// 초기 지도 뷰 설정 (위치, 확대, 시점 등)
const INITIAL_VIEW_STATE = { 
  longitude: 127.130622, // 경도 (포항공대 위치 등, 실제 환경에 맞게 수정)
  latitude: 37.451748,   // 위도
  zoom: 15,              // 지도 확대 레벨
  pitch: 30,             // 시점 각도
  bearing: 0             // 지도의 회전 각도
};

const minTime = 0;
const animationSpeed = 0.5;
const mapStyle = "mapbox://styles/spear5306/ckzcz5m8w002814o2coz02sjc";

// mapbox API 키 (개인 키를 입력해서 사용)
const MAPBOX_TOKEN = `pk.eyJ1Ijoic2hlcnJ5MTAyNCIsImEiOiJjbG00dmtic3YwbGNoM2Zxb3V5NmhxZDZ6In0.ZBrAsHLwNihh7xqTify5hQ`;

/* 
  애니메이션 시간 업데이트 함수: 한 틱(time step)씩 증가, 최대치 넘으면 다시 0으로 초기화
*/
// maxTime은 데이터에 따라 동적으로 계산 (컴포넌트 내부에서 계산)

// 한 자리 숫자 시간(분/시) 앞에 0을 붙임 (시계 표기용)
const addZeroFill = (value) => {
  const valueString = value.toString();
  return valueString.length < 2 ? "0" + valueString : valueString;
};

/*
  화면에 표시할 애니메이션 시간(시:분 포맷) 반환
*/
const returnAnimationDisplayTime = (time) => {
  const hour = addZeroFill(parseInt((Math.round(time) / 60) % 24));
  const minute = addZeroFill(Math.round(time) % 60);
  return [hour, minute];
};

/*
  선택한 시각(time)에 유효한 trip만 골라내는 함수 (미사용)
*/
const currData = (data, time) => {
  const arr = [];
  data.forEach((v) => {
    const timestamp = v.timestamp;
    const s_t = timestamp[0];
    const e_t = timestamp[timestamp.length - 1];
    if (s_t <= time && e_t >= time) {
      arr.push(v);
    }
  });
  return arr;
};

/*
  Trip 컴포넌트: 여행(trip) 경로 데이터를 받아, 지도 위에 시간에 따라 함선을 따라가는 듯한 애니메이션을 표시
*/
const Trip = (props) => {
  // time: 현재 트립 애니메이션의 시간(프레임)
  const [time, setTime] = useState(minTime);
  // animation: 애니메이션 frame id 저장용(해제시 사용)
  const [animation] = useState({});
  // trip 데이터 (경로, 시간 정보 포함)
  const trip = props.trip;
  const passengers = props.passengers || [];

  // 데이터 기반 최대 시간 계산
  const dataMaxFromTrips = React.useMemo(() => {
    if (!trip || trip.length === 0) return 0;
    let maxT = 0;
    for (const t of trip) {
      if (t && t.timestamp && t.timestamp.length) {
        const last = t.timestamp[t.timestamp.length - 1];
        if (typeof last === 'number' && last > maxT) maxT = last;
      }
    }
    return maxT;
  }, [trip]);

  const dataMaxFromPassengers = React.useMemo(() => {
    if (!passengers || passengers.length === 0) return 0;
    let maxT = 0;
    for (const p of passengers) {
      if (p && p.timestamp && p.timestamp.length) {
        const last = p.timestamp[p.timestamp.length - 1];
        if (typeof last === 'number' && last > maxT) maxT = last;
      }
    }
    return maxT;
  }, [passengers]);

  const maxTime = React.useMemo(() => {
    const m = Math.max(60, dataMaxFromTrips, dataMaxFromPassengers);
    return Number.isFinite(m) && m > 0 ? m : 60;
  }, [dataMaxFromTrips, dataMaxFromPassengers]);

  // 시간 증가 함수 (데이터 최대 시간 기준으로 순환)
  const returnAnimationTime = useCallback((t) => {
    if (t > maxTime) {
      return minTime;
    }
    return t + 0.01 * animationSpeed;
  }, [maxTime]);

  // 애니메이션 동작 함수: 시간이 0.01*speed 씩 증가하며, 애니메이션 갱신
  const animate = useCallback(() => {
    setTime((time) => returnAnimationTime(time));
    animation.id = window.requestAnimationFrame(animate);
  }, [animation]);

  // mount될 때 애니메이션 시작, unmount시 애니메이션 해제
  useEffect(() => {
    animation.id = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animation.id);
  }, [animation, animate]);

  /**
   * TripsLayer: 덱글에서 시간에 따라 경로(trip)의 움직임을 시각적으로 보여주는 레이어
   * - id: 레이어 식별자
   * - data: trip 객체 배열 (각 객체는 route(선 좌표 배열), timestamp(각 좌표의 시간), 등 필드 보유)
   * - getPath: 각 trip 데이터에서 경로 추출 -> d.route는 위도/경도 좌표 배열
   * - getTimestamps: 각 좌표별 시간 정보 배열 추출 -> d.timestamp
   * - getColor: 트레일(이동 경로) 색상 지정 (예시: 노란색)
   * - opacity: 불투명도
   * - widthMinPixels: 선 폭(px 단위 최소값, 작은 값이면 너무 얇게 나와서 보기 어려움)
   * - rounded, capRounded, jointRounded: 라인의 끝부분/꺾이는 부분을 둥글게 할지 여부
   * - trailLength: 트레일 길이 (뒤에 잔상이 얼마만큼 남을지, 단위는 data timestamp 단위와 동일)
   * - currentTime: 현재 애니메이션 시간 (이 값 이전까지의 경로만 표현됨)
   * - shadowEnabled: 그림자 효과 적용 여부
   */
  // 현재 시간에 보일 승객만 필터링 (차량 도착 시점 이후에는 사라짐)
  const visiblePassengers = React.useMemo(() => {
    if (!passengers || passengers.length === 0) return [];
    return passengers.filter((p) => Array.isArray(p.timestamp) && p.timestamp.length === 2 && p.timestamp[0] <= time && p.timestamp[1] > time);
  }, [passengers, time]);

  const layers = [
    new TripsLayer({  
      id: 'trips',
      data: trip,
      getPath: d => d.route,
      getTimestamps: d => d.timestamp,
      getColor: [255, 255, 0],
      opacity: 1,
      widthMinPixels: 7,
      rounded: true,
      capRounded : true,
      jointRounded : true,
      trailLength : 0.5,
      currentTime: time,
      shadowEnabled: false
    }),
    // 승객: 흰색 포인트, 픽업 완료 시 사라짐
    new ScatterplotLayer({
      id: 'passengers',
      data: visiblePassengers,
      getPosition: d => d.location,
      getFillColor: [255, 255, 255],
      getRadius: 6,
      radiusUnits: 'pixels',
      pickable: true,
      updateTriggers: {
        getPosition: [time]
      }
    }),
    // 목적지: 주황색 포인트, 픽업 이후부터 도착까지 표시
    new ScatterplotLayer({
      id: 'destinations',
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arr = [];
        for (const t of trip) {
          if (!t || !t.route || !t.timestamp || t.route.length < 2 || t.timestamp.length < 2) continue;
          const drop = t.route[t.route.length - 1];
          const start = t.timestamp.length > 1 ? t.timestamp[1] : t.timestamp[0];
          const end = t.timestamp[t.timestamp.length - 1];
          if (typeof start !== 'number' || typeof end !== 'number') continue;
          if (time >= start && time <= end) {
            arr.push({ location: drop });
          }
        }
        return arr;
      })(),
      getPosition: d => d.location,
      getFillColor: [255, 165, 0],
      getRadius: 5,
      radiusUnits: 'pixels',
      pickable: false,
      updateTriggers: {
        getPosition: [time]
      }
    }),
    // 매칭된 차량-승객 링크: ArcLayer(흰색), 현재 차량 위치 → 픽업 지점까지(픽업 완료 시 사라짐)
    new ArcLayer({
      id: 'match-arcs',
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arcs = [];
        for (const t of trip) {
          if (!t || !t.route || !t.timestamp || t.route.length < 2 || t.timestamp.length < 2) continue;
          const ts = t.timestamp;
          const rt = t.route;
          const start = ts[0];
          const pickupTime = ts[1];
          if (typeof start !== 'number' || typeof pickupTime !== 'number') continue;
          if (time < start || time > pickupTime) continue;
          // 현재 차량 위치 보간: ts[k] <= time < ts[k+1]
          let idx = 0;
          for (let k = 0; k < ts.length - 1; k++) {
            if (typeof ts[k] === 'number' && typeof ts[k+1] === 'number' && ts[k] <= time && time < ts[k+1]) {
              idx = k;
              break;
            }
            if (time >= ts[ts.length - 1]) idx = ts.length - 2;
          }
          const a = rt[Math.max(0, Math.min(idx, rt.length - 1))];
          const b = rt[Math.max(0, Math.min(idx + 1, rt.length - 1))];
          const t0 = ts[Math.max(0, Math.min(idx, ts.length - 1))];
          const t1 = ts[Math.max(0, Math.min(idx + 1, ts.length - 1))];
          let curr = a;
          if (typeof t0 === 'number' && typeof t1 === 'number' && t1 > t0) {
            const alpha = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));
            const x = a[0] + (b[0] - a[0]) * alpha;
            const y = a[1] + (b[1] - a[1]) * alpha;
            curr = [x, y];
          }
          const pickup = rt[1];
          if (Array.isArray(curr) && Array.isArray(pickup)) {
            arcs.push({ source: curr, target: pickup });
          }
        }
        return arcs;
      })(),
      getSourcePosition: d => d.source,
      getTargetPosition: d => d.target,
      getSourceColor: [255, 255, 255],
      getTargetColor: [255, 255, 255],
      getWidth: 3,
      pickable: false,
      updateTriggers: {
        getSourcePosition: [time],
        getTargetPosition: [time]
      }
    }),
    // 승객 탑승 중: 현재 차량 위치 → 목적지까지 주황색 얇은 아크
    new ArcLayer({
      id: 'occupied-arcs',
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arcs = [];
        for (const t of trip) {
          if (!t || !t.route || !t.timestamp || t.route.length < 2 || t.timestamp.length < 2) continue;
          const ts = t.timestamp;
          const rt = t.route;
          const pickupTime = ts[1];
          const dropTime = ts[ts.length - 1];
          if (typeof pickupTime !== 'number' || typeof dropTime !== 'number') continue;
          if (time < pickupTime || time > dropTime) continue;

          // 현재 위치 보간
          let idx = 0;
          for (let k = 0; k < ts.length - 1; k++) {
            if (typeof ts[k] === 'number' && typeof ts[k+1] === 'number' && ts[k] <= time && time < ts[k+1]) {
              idx = k;
              break;
            }
            if (time >= ts[ts.length - 1]) idx = ts.length - 2;
          }
          const a = rt[Math.max(0, Math.min(idx, rt.length - 1))];
          const b = rt[Math.max(0, Math.min(idx + 1, rt.length - 1))];
          const t0 = ts[Math.max(0, Math.min(idx, ts.length - 1))];
          const t1 = ts[Math.max(0, Math.min(idx + 1, ts.length - 1))];
          let curr = a;
          if (typeof t0 === 'number' && typeof t1 === 'number' && t1 > t0) {
            const alpha = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));
            const x = a[0] + (b[0] - a[0]) * alpha;
            const y = a[1] + (b[1] - a[1]) * alpha;
            curr = [x, y];
          }

          const dest = rt[rt.length - 1];
          if (Array.isArray(curr) && Array.isArray(dest)) {
            arcs.push({ source: curr, target: dest });
          }
        }
        return arcs;
      })(),
      getSourcePosition: d => d.source,
      getTargetPosition: d => d.target,
      getSourceColor: [255, 165, 0],
      getTargetColor: [255, 165, 0],
      getWidth: 1.5,
      pickable: false,
      updateTriggers: {
        getSourcePosition: [time],
        getTargetPosition: [time]
      }
    })
  ];
  
  // 슬라이더로 시간 제어 시 호출되는 함수 (애니메이션 시간 수동 변경)
  const SliderChange = (value) => {
    const time = value.target.value;
    setTime(time);
  };

  // 시:분 포맷(표시용) 얻기
  const [hour, minute] = returnAnimationDisplayTime(time);

  // 실제 렌더링
  return (
    <div className="trip-container" style={{ position: "relative" }}>
      {/* DeckGL: 지도와, trips 경로를 레이어로 올려 시각화 */}
      <DeckGL
        effects={DEFAULT_THEME.effects}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
      >
        {/*.react-map-gl의 Map: 실제 지도의 스타일 및 Mapbox 토큰 적용 */}
        <Map mapStyle={mapStyle} mapboxAccessToken={MAPBOX_TOKEN} preventStyleDiffing={true}/>
      </DeckGL>
      {/* 현재 시간 표시 */}
      <h1 className="time">TIME : {`${hour} : ${minute}`}</h1>
      {/* 시간 슬라이더: 사용자 조작으로 원하는 시간에 맞춰 볼 수 있음 */}
      <Slider
        id="slider"
        value={time}
        min={minTime}
        max={maxTime}
        onChange={SliderChange}
        track="inverted"
      />
    </div>
  );
};

export default Trip;
