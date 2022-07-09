// import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import "./App.scss";

// pages
import Login from "./pages/Login";
import Home from "./pages/Home";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/home" element={<Home />} />
    </Routes>
  );
}

export default App;
