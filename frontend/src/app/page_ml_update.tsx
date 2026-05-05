"use client";

import axios from "axios";
import ModalDocumentos from "@/app/components/ModalDocumentos";
import toast from "react-hot-toast";
import { formatarParaBR } from "@/utils/datas";
import { NumericFormat, PatternFormat } from "react-number-format";
import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

// 🧠 Imports para sistema de aprendizado automático
import { useAprendizadoMensagens } from "@/hooks/useAprendizadoMensagens";
import { useAprendizadoCorrecao } from "@/hooks/useAprendizadoCorrecao";
import AprendizadoMensagens from "@/components/AprendizadoMensagens";
import { MLStatusIndicator } from "@/components/MLStatusIndicator";
import "@/styles/aprendizado.css";
