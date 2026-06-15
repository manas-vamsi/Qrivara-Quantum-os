"""Static read-only catalogs (component library + materials), mirroring the
frontend SSOT. Custom components live in the DB; these are the built-ins."""

COMPONENT_LIBRARY = [
    # Qubits
    {"id": "transmon", "kind": "transmon", "name": "Transmon", "category": "Qubits", "color": "primary",
     "description": "Charge-insensitive qubit (EJ >> EC)",
     "defaults": {"pad_width_um": 455, "pad_height_um": 90, "pad_gap_um": 30, "junction_width_nm": 200,
                  "junction_length_nm": 200, "fillet_radius_um": 10, "halo_gap_um": 40,
                  "target_freq_GHz": 5.2, "anharmonicity_MHz": -310, "material": "Aluminum", "layer": 1}},
    {"id": "xmon", "kind": "transmon", "name": "Xmon", "category": "Qubits", "color": "primary",
     "description": "Cross-shaped transmon with 4 coupling arms",
     "defaults": {"arm_length_um": 180, "arm_width_um": 24, "cross_width_um": 24, "gap_um": 30,
                  "fillet_radius_um": 5, "target_freq_GHz": 5.0, "material": "Aluminum", "layer": 1}},
    {"id": "concentric-transmon", "kind": "transmon", "name": "Concentric Transmon", "category": "Qubits", "color": "primary",
     "description": "Circular center pad with outer ring, low footprint",
     "defaults": {"inner_radius_um": 120, "outer_radius_um": 160, "gap_um": 20, "target_freq_GHz": 4.8}},
    {"id": "fluxonium", "kind": "fluxonium", "name": "Fluxonium", "category": "Qubits", "color": "violet",
     "description": "Junction-array shunted qubit, high anharmonicity",
     "defaults": {"inductor_count": 100, "loop_area_um2": 30, "junction_area_um2": 0.02,
                  "kinetic_inductance_pH": 15, "target_freq_GHz": 0.5}},
    # Resonators
    {"id": "cpw-resonator", "kind": "resonator", "name": "CPW Resonator", "category": "Resonators", "color": "cyan",
     "description": "Coplanar-waveguide resonator",
     "defaults": {"length_um": 4200, "width_um": 10, "gap_um": 6, "fillet_radius_um": 90,
                  "impedance_ohm": 50, "target_freq_GHz": 6.5}},
    {"id": "readout-resonator", "kind": "resonator", "name": "Readout Resonator", "category": "Resonators", "color": "cyan",
     "description": "Dispersive readout resonator",
     "defaults": {"length_um": 4200, "fillet_radius_um": 90, "coupling_MHz": 1.2, "frequency_GHz": 7.1}},
    {"id": "purcell-filter", "kind": "purcell-filter", "name": "Purcell Filter", "category": "Resonators", "color": "cyan",
     "description": "Bandpass filter to prevent qubit decay via readout",
     "defaults": {"bandwidth_MHz": 50, "frequency_GHz": 7.1, "length_um": 2000}},
    # Couplers
    {"id": "capacitive-coupler", "kind": "coupler", "name": "Capacitive Coupler", "category": "Couplers", "color": "violet",
     "description": "Direct capacitive qubit-qubit coupling",
     "defaults": {"distance_um": 12, "coupling_length_um": 120, "capacitance_fF": 4.5}},
    {"id": "inductive-coupler", "kind": "coupler", "name": "Inductive Coupler", "category": "Couplers", "color": "violet",
     "description": "Mutual-inductance coupling element",
     "defaults": {"mutual_inductance_pH": 2.1, "loop_area_um2": 40, "distance_um": 10}},
    {"id": "snail-coupler", "kind": "squid", "name": "SNAIL Coupler", "category": "Couplers", "color": "violet",
     "description": "Asymmetric SQUID for 3-wave mixing and 0-ZZ crosstalk",
     "defaults": {"loop_area_um2": 25, "asymmetry_ratio": 0.1, "target_g_MHz": 100}},
    # Control
    {"id": "drive-line", "kind": "junction", "name": "Drive Line", "category": "Control", "color": "warning",
     "description": "XY microwave drive line",
     "defaults": {"width_um": 10, "gap_um": 6, "impedance_ohm": 50, "power_dBm": -30}},
    {"id": "flux-line", "kind": "flux-line", "name": "Flux Line", "category": "Control", "color": "warning",
     "description": "Z flux-bias control line",
     "defaults": {"current_mA": 1.0, "width_um": 4, "distance_um": 8}},
    # Readout
    {"id": "feedline", "kind": "feedline", "name": "Feedline", "category": "Readout", "color": "success",
     "description": "Shared readout transmission line",
     "defaults": {"length_um": 2800, "width_um": 10, "gap_um": 6, "fillet_radius_um": 90, "impedance_ohm": 50}},
    {"id": "readout-port", "kind": "launchpad", "name": "Readout Port", "category": "Readout", "color": "success",
     "description": "Wirebond IO port for readout",
     "defaults": {"freq_range_GHz": "6-8", "power_dBm": -40}},
    {"id": "jpa", "kind": "parametric-amplifier", "name": "Parametric Amp (JPA)", "category": "Readout", "color": "success",
     "description": "On-chip Josephson Parametric Amplifier for signal boost",
     "defaults": {"gain_dB": 20, "bandwidth_MHz": 20, "center_freq_GHz": 7.1}},
    # Chip
    {"id": "chip-substrate", "kind": "ground", "name": "Chip Substrate", "category": "Chip", "color": "success",
     "description": "Wafer substrate the circuit is patterned on",
     "defaults": {"length_mm": 9, "width_mm": 9, "thickness_um": 525, "material": "Silicon"}},
    {"id": "ground-plane", "kind": "ground", "name": "Ground Plane", "category": "Chip", "color": "success",
     "description": "Patterned ground reference layer",
     "defaults": {"layer": 0, "thickness_nm": 200}},
    {"id": "air-bridge", "kind": "airbridge", "name": "Air Bridges", "category": "Chip", "color": "success",
     "description": "Crossover suppressing slotline modes",
     "defaults": {"length_um": 30, "width_um": 8, "height_um": 3}},
    {"id": "tsv", "kind": "tsv", "name": "Through-Silicon Via", "category": "Chip", "color": "success",
     "description": "Vertical interconnect for 3D routing",
     "defaults": {"diameter_um": 20, "depth_um": 150, "material": "Copper"}},
]

CONDUCTORS = [
    {"id": "al", "name": "Aluminum", "conductivity_Sm": 3.8e7, "tcK": 1.2, "note": "Junction electrodes"},
    {"id": "nb", "name": "Niobium", "conductivity_Sm": 6.6e6, "tcK": 9.3, "note": "Workhorse film"},
    {"id": "tin", "name": "Titanium Nitride", "conductivity_Sm": 5.0e6, "tcK": 4.5, "note": "High kinetic inductance"},
    {"id": "ta", "name": "Tantalum", "conductivity_Sm": 7.7e6, "tcK": 4.4, "note": "Record coherence"},
    {"id": "au", "name": "Gold", "conductivity_Sm": 4.1e7, "tcK": 0, "note": "Normal-metal wirebond / GND"},
    {"id": "cu", "name": "Copper", "conductivity_Sm": 5.96e7, "tcK": 0, "note": "Normal-metal packaging"},
]

SUBSTRATES = [
    {"id": "si", "name": "Silicon", "eps": 11.7, "tanD": 2e-7, "thickness_um": 525, "note": "High-resistivity Si"},
    {"id": "sapphire", "name": "Sapphire", "eps": 9.8, "tanD": 1e-7, "thickness_um": 430, "note": "Low-loss c-plane"},
    {"id": "sic", "name": "Silicon Carbide", "eps": 9.7, "tanD": 5e-7, "thickness_um": 500, "note": "High thermal conductivity"},
    {"id": "quartz", "name": "Quartz", "eps": 3.8, "tanD": 3e-7, "thickness_um": 500, "note": "Fused silica"},
]

LOSS_INTERFACES = [
    {"id": "MA", "name": "Metal-Air", "p": 6e-5, "tanD": 1.5e-3},
    {"id": "SA", "name": "Substrate-Air", "p": 9e-5, "tanD": 2.2e-3},
    {"id": "MS", "name": "Metal-Substrate", "p": 3e-5, "tanD": 2.6e-3},
    {"id": "bulk", "name": "Bulk dielectric", "p": 0.9, "tanD": 1.8e-7},
]

DRC_RULES = [
    {"id": "gap", "name": "Min CPW gap", "value": 6, "min": 4, "unit": "um"},
    {"id": "width", "name": "Min trace width", "value": 10, "min": 4, "unit": "um"},
    {"id": "jj", "name": "Junction overlap", "value": 0.045, "min": 0.02, "max": 0.09, "unit": "um2"},
    {"id": "spacing", "name": "Qubit spacing", "value": 1200, "min": 800, "unit": "um"},
    {"id": "airbridge", "name": "Airbridge span", "value": 30, "min": 10, "max": 60, "unit": "um"},
    {"id": "keepout", "name": "Dicing keep-out", "value": 200, "min": 150, "unit": "um"},
]
