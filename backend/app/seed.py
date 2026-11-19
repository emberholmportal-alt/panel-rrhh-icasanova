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
    elif tipo == "coordinador":    # nómina, lista de eventuales, asigna francos, pide vacaciones; vacaciones y cumpleaños solo en pantalla
        p = {"nomina": "ver", "eventuales": "ver", "francos": "editar", "vacsol": "editar", "vacaciones": "consulta", "cumpleanos": "consulta", "chat": "editar"}
    elif tipo == "lectura":        # ve todas las secciones y descarga informes, sin modificar nada
        p = {m: "ver" for m in TODOS + ["menu", "vacsol", "agenda", "hextras"]}
        return p
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
    ("rcampos", "Campos, Rubén", "lectura", "$2b$12$1R31TnKWCT2xtJ4hSr0szuwVI67cie3EAqJIvPZ/ex0yXv3PbXkRO"),
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
    # alta 18/11/2026
    ("scampos", "Campos, Sergio", "coordinador", "$2b$12$uDBVakoI1Mrd.d5iTRXQn.VcYKIWDqaG3xhriJk6jc6yzpLvy9N3m"),
]


# Cambios de permisos para usuarios que ya existen (se aplican una sola vez, en orden).
COORDINADORES = ["wchaparro", "jovalles", "mleiva", "jalbarracin", "cdiarte", "ploiacono", "psilva", "hsalinas", "scampos"]
MIGRACIONES = [
    ("2026-11-16-vacaciones", [
        # coordinadores: ven vacaciones y cumpleaños sin descargar ni modificar
        *[(u, {"vacaciones": "consulta", "cumpleanos": "consulta"}) for u in COORDINADORES],
        # Joaquín carga vacaciones directo y aprueba pedidos
        ("joliva", {"vacaciones": "editar"}),
    ]),
    ("2026-11-16-hextras", [
        # Horas extras: la ven RRHH (Cynthia, Joaquín), Rubén y Luis
        ("cbertetti", {"hextras": "ver"}), ("joliva", {"hextras": "ver"}),
        ("rcampos", {"hextras": "ver"}), ("lmunoz", {"hextras": "ver"}),
    ]),
    ("2026-11-17-viandas", [
        # Estimativo de viandas: lo ve Milagros Marchioro (comedor)
        ("mmarchioro", {"viandas": "ver"}),
    ]),
    ("2026-11-17-llegadas-tarde", [
        # Llegadas tarde (antes "Ausentismo"): Cynthia, Joaquín, Rubén y Luis la ven (solo tardanzas y reincidencias)
        ("cbertetti", {"ausentismo": "min:ver"}), ("joliva", {"ausentismo": "min:ver"}),
        ("rcampos", {"ausentismo": "min:ver"}), ("lmunoz", {"ausentismo": "min:ver"}),
    ]),
    ("2026-11-16-rcampos", [
        # Rubén Campos: todas las secciones, solo ver y descargar informes
        ("rcampos", {m: "ver" for m in TODOS + ["menu", "vacsol", "agenda"]}),
    ]),
]


# Personas que se suman a la nómina a mano (no figuran en el reloj, ej. delegados gremiales).
# Se guardan en nomina.extra: sobreviven a cada carga nueva del export de Movimientos.
# Cada entrada se aplica una sola vez (clave en "_migraciones").
NOMINA_EXTRA = [
    ("2026-11-16-delegados", {
        "199123": {"nombre": "BARRAZA, OMAR ARNALDO", "tipo": "EF", "sector": "DELEGADOS"},
        "181543": {"nombre": "NAVARRO, GUSTAVO DANIEL", "tipo": "EF", "sector": "DELEGADOS"},
        "208124": {"nombre": "OZORIO, MATIAS NICOLAS LEONEL", "tipo": "EF", "sector": "DELEGADOS"},
    }),
]


# Eventuales con apto frío (certificados que pasó RRHH el 19/11/2026). Se cargan una sola vez en el
# documento de Eventuales ("aptoFrio"); después se marcan o desmarcan desde el panel.
APTO_FRIO = ("2026-11-19-apto-frio", {
    "286069": "NUÑEZ CRISTIAN OMAR", "285548": "VERDUC ALAN FACUNDO", "285552": "RUIZ TOMAS LEONEL",
    "148653": "PRADO RUBEN YAMIL", "285550": "VERON ERIK NAHUEL", "285549": "CHAMORRO ESQUIVEL LUIS TOMAS",
    "285722": "ORELLANA PABLO LEONARDO", "286010": "RIBERO MUÑIZ LUIS EZEQUIEL", "286061": "JAIME JONATAN YAMIL",
    "286515": "ALMEIDA CRISTIAN HERNAN", "286540": "DIAZ DIEGO RICARDO", "286520": "GALARZA ERIC TOBIAS",
    "286524": "GOMEZ FEDERICO PABLO", "286516": "MARQUEZ NICOLAS EZEQUIEL", "219588": "PALADEA LEONARDO DANIEL",
    "286334": "TORRES RODRIGO", "284977": "CASTELLO ROLANDO DANIEL", "284675": "FERREYRA MATIAS GABRIEL",
})
