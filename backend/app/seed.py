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
    ("cbertetti", "Bertetti, Cynthia", "todos", "$2b$12$ygJmn82KnyVKzw9FuZHiS.bgURITnD5MCSuQNV6NCPGin8ryI0Cze"),
    ("joliva", "Oliva, Joaquín", "todos", "$2b$12$EK7kl.NTVcbwieI2hb.O/eHenAteFLXxVPfFcr2phK2JXTD7Bug1i"),
    ("lmunoz", "Muñoz, Luis", "sin_ropa", "$2b$12$BAyGnlyR3En4ZWITncztvOSV1Z4IFcM5MSs6.I4Er62yPt.i7XxoK"),
    ("rcampos", "Campos, Rubén", "sin_ropa", "$2b$12$1R31TnKWCT2xtJ4hSr0szuwVI67cie3EAqJIvPZ/ex0yXv3PbXkRO"),
    ("avivone", "Vivone, Aylén", "aylen", "$2b$12$5qmwwOlRlCleVF4kg8.gpeRkNM5OvO4JPYKTR/Opr0zoreH8aLfBq"),
    ("mmarchioro", "Marchioro, Milagros", "milagros", "$2b$12$EfYydoVP4K3ZRW4ryGGre.uzbEuAitYu1o3gfZlbiiWiP0CMrZ5Ve"),
]
