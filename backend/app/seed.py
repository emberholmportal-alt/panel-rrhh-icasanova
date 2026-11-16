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
    elif tipo == "coordinador":    # nómina, lista de eventuales, asigna francos, carga pedidos de vacaciones y ve el menú
        p = {"nomina": "ver", "eventuales": "ver", "francos": "editar", "vacsol": "editar"}
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
    # coordinadores (alta 16/11/2026)
    ("wchaparro", "Chaparro, Walter", "coordinador", "$2b$12$XRCWqInoOQTYFPD/6zpnwOhNGZczOAxnTukUbxXTEnJIZ6fZrY0nO"),
    ("jovalles", "Ovalles, José", "coordinador", "$2b$12$/f7Vhdsy04Gqx6Jf0Gq2BOOe0keMMNLDG2c9PWgozIPCJpL8PS20a"),
    ("mleiva", "Leiva, Mariano", "coordinador", "$2b$12$RTRMVulfd1MGj/GcviB0Ku0l.Cf66yxxSKpF270reLhXXDKbbELQO"),
    ("jalbarracin", "Albarracín, Jonathan", "coordinador", "$2b$12$cAS4EHR1fVyWXFTd5R/9ZuyZvR20w8l.AAvCg5cUDcieYaMvPPMVa"),
    ("cdiarte", "Diarte, César", "coordinador", "$2b$12$fk68J5pcXgektyKsrvj6HuKeVCMbYik4rWRVYCDIfGe/sP1U75wta"),
    ("ploiacono", "Loiacono, Pablo", "coordinador", "$2b$12$WAogFMDEeIKrQZPTlzFTO.vkYjetymqa11KvQgFdnC/rQVQwUe2ke"),
    ("psilva", "Silva, Pablo", "coordinador", "$2b$12$r0qxqtKTbUzRboqFC2WrrueOfy2bSSbm043z8RGa4aLy/gh74WBiu"),
    ("hsalinas", "Salinas, Hernán", "coordinador", "$2b$12$4uyaYRixETJ.Od4L1tbRsOTvJhlMKnOgvo/7N9mLMF3U.8W0sttry"),
]
