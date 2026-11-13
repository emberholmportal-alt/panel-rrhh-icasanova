"""Usuarios iniciales del panel (alta única).

Se crean al arrancar el servidor solo si todavía no existen. Las contraseñas son
temporales: cada persona tiene que elegir la suya en el primer ingreso. Si alguna
se pierde, el administrador genera una nueva desde Configuración → Usuarios y permisos.
"""
TODOS = ["ausentismo", "vacaciones", "eventuales", "francos", "indumentaria", "f3", "anticipos", "nomina", "cumpleanos"]


def perfil(tipo: str) -> dict:
    if tipo == "todos":            # ve y descarga informes de todos los módulos
        p = {m: "ver" for m in TODOS}
    elif tipo == "sin_ropa":       # igual, sin indumentaria
        p = {m: "ver" for m in TODOS if m != "indumentaria"}
    elif tipo == "milagros":       # nómina, francos de eventuales por día, menú semanal (carga) y cumpleaños del mes
        p = {"nomina": "ver", "francos": "ver", "menu": "editar", "cumpleanos": "ver"}
    elif tipo == "aylen":          # vacaciones (próximas y en curso) y nómina
        p = {"vacaciones": "ver", "nomina": "ver"}
    else:
        p = {}
    p["agenda"] = "editar"         # todos completan la agenda compartida (la cartelera es para todos)
    return p


# usuario, nombre, perfil, hash de la contraseña temporal
USUARIOS = [
    ("cbertetti", "Bertetti, Cynthia", "todos", "$2b$12$jhMTepuQgN5T67Pm/lgB2uNmN.Ywh40j8DG8t1eMzEYDW42XFpknm"),
    ("joliva", "Oliva, Joaquín", "todos", "$2b$12$TKN0BZ2J9G6nhFiJuKHi1uBbDg/VZ1UiS90Zr6k5U0J4uNiXKkJIy"),
    ("lmunoz", "Muñoz, Luis", "sin_ropa", "$2b$12$gPcR/eV9QNaJSGQkeetrHeUn7kC0cJt6mrNASac2hgsw2BSyp3D8S"),
    ("rcampos", "Campos, Rubén", "sin_ropa", "$2b$12$KCYqVKx9SGenlQLALAP9zudnvuyq7RDCluL50cs7ebCgeG8062V6e"),
    ("avivone", "Vivone, Aylén", "aylen", "$2b$12$GyH42VWs6VTPI2gb0oSr8e5e.qDK4lNMRwm0W0w5YxURdE3Y4rl02"),
    ("mmarchioro", "Marchioro, Milagros", "milagros", "$2b$12$QlSsdeRjR60kTgd.f7dVJOEr6KwRx0Hfthgzt5KkoljyaENtYfQ32"),
]
