Project Requirements

Web-Based Hybrid SDN and Routing Orchestration Platform

⸻

1. Project Overview

This project aims to design and implement a web-based hybrid network orchestration platform that integrates traditional IP routing and Software-Defined Networking (SDN) concepts into a single controllable system.

The platform combines:
	•	Dynamic routing control using FRRouting
	•	Policy-based flow control using an SDN controller
	•	High-performance packet forwarding using a virtual switch
	•	A centralized Web GUI for orchestration, visualization, and management

The project is designed primarily as a learning, experimentation, and portfolio platform, while maintaining an architecture close to real-world production systems used in data centers, cloud environments, and service provider networks.

⸻

2. Goals and Objectives

Primary Goals
	•	Provide a unified control platform for routing control-plane and SDN-based flow control
	•	Enable users to manage complex network behaviors through a Web GUI
	•	Demonstrate hybrid networking principles rather than replacing traditional routing
	•	Simulate real-world network scenarios such as data center fabrics and WANs

Learning Objectives
	•	Understand the interaction between routing protocols and SDN flow programming
	•	Gain hands-on experience with virtual switching, tunneling, and overlay networking
	•	Learn how orchestration layers interact with network control and data planes
	•	Develop a production-like system architecture suitable for interviews and technical discussions

⸻

3. System Architecture

High-Level Architecture

Web Frontend (GUI)
        |
REST API (Backend)
        |
------------------------------------------------
|              |               |               |
Routing Engine   SDN Controller   Switch Manager   Topology & Monitoring
(FRR)             (Ryu)           (OVS)           (Discovery / Metrics)
        |
Linux Kernel Networking Stack

Architectural Principles
	•	Clear separation of concerns between routing, flow control, and forwarding
	•	Modular components that can be deployed together or independently
	•	Support for both single-node and multi-node deployments
	•	Linux-based infrastructure for full networking feature support

⸻

4. Deployment Models

4.1 Single-Node Deployment (Phase 1)
	•	All components run on a single Linux virtual machine
	•	Used for development, debugging, and proof-of-concept
	•	Simplified networking topology

4.2 Multi-Node Deployment (Phase 2)
	•	Separate nodes for controllers and forwarding devices
	•	Simulates production-like distributed environments
	•	Supports scalability and failure scenarios

⸻

5. Supported Network Modes

5.1 Data Center (DC) Mode
	•	Overlay networking using VXLAN
	•	Control-plane based on BGP EVPN
	•	Multi-tenant virtual network segmentation
	•	Logical L2/L3 separation per tenant

5.2 WAN Mode
	•	Traditional routing using BGP and/or OSPF
	•	Tunneling using GRE or VXLAN
	•	Policy-based traffic steering
	•	Path selection and failover simulation

The system must support switching between DC Mode and WAN Mode via configuration or GUI selection.

⸻

6. Functional Requirements

6.1 Web Graphical User Interface (GUI)

The Web GUI shall:
	•	Provide a centralized dashboard for network management
	•	Visualize network topology (nodes, links, tunnels)
	•	Display routing tables and forwarding states
	•	Allow creation, modification, and deletion of network policies
	•	Support real-time or near-real-time updates

⸻

6.2 Backend API Layer

The backend shall:
	•	Expose RESTful APIs for all major platform functions
	•	Translate GUI actions into system-level network configurations
	•	Act as an orchestration layer between routing, SDN, and switching components
	•	Validate user input and prevent invalid configurations

⸻

6.3 Routing Control (FRRouting)

The routing subsystem shall:
	•	Support dynamic routing protocols such as BGP and OSPF
	•	Allow configuration of routing neighbors through the Web GUI
	•	Maintain and expose routing tables via the backend API
	•	Support EVPN control-plane for overlay networking
	•	Reload or update routing configurations dynamically without full system restart

⸻

6.4 SDN Control (Ryu Controller)

The SDN subsystem shall:
	•	Act as a centralized flow control engine
	•	Handle packet-in events from forwarding devices
	•	Install, modify, and remove flow rules dynamically
	•	Enforce policy-based forwarding decisions
	•	Provide REST APIs for flow and policy management

⸻

6.5 Data Plane (Virtual Switching)

The data plane shall:
	•	Forward packets based on installed flow rules
	•	Support VLANs and overlay tunnels
	•	Integrate with the Linux kernel networking stack
	•	Provide visibility into flow tables and forwarding behavior
	•	Allow traffic manipulation such as drop, redirect, or modify actions

⸻

6.6 Topology Discovery and Monitoring

The platform shall:
	•	Discover network topology automatically or semi-automatically
	•	Monitor link and node status
	•	Collect statistics such as packet counts and flow utilization
	•	Display monitoring data in the Web GUI

⸻

7. Advanced Features (Optional / Phase 3)
	•	Failure simulation (link down, node failure)
	•	Traffic engineering and policy-based path selection
	•	Multi-tenant isolation and segmentation
	•	Scenario-based demos (DC fabric, SD-WAN, hybrid cloud)
	•	Exportable logs and metrics

⸻

8. Security and Access Control

The system should:
	•	Restrict access to the Web GUI using authentication
	•	Separate read-only and administrative operations
	•	Prevent unsafe or destructive network configurations
	•	Log configuration changes for audit purposes

⸻

9. Technology Stack Requirements

Core Technologies
	•	Linux-based operating system
	•	Python for backend services and SDN logic
	•	RESTful APIs for component communication

Frontend
	•	Modern JavaScript framework (e.g., React or Vue)
	•	Topology visualization library
	•	Responsive UI design

Backend
	•	API framework (e.g., FastAPI or Flask)
	•	System command execution and process control
	•	Configuration templating and state management

⸻

10. Documentation Requirements

The project must include:
	•	High-level architecture documentation
	•	Detailed component descriptions
	•	Deployment guides for single-node and multi-node setups
	•	Example use cases and demos
	•	Clear README suitable for public GitHub deployment

⸻

11. Expected Outcomes

By completing this project, the system will:
	•	Demonstrate practical knowledge of hybrid networking architectures
	•	Provide a realistic simulation of modern network infrastructures
	•	Serve as a strong technical portfolio project
	•	Enable deeper understanding of routing, SDN, and orchestration concepts

⸻

12. Key Design Philosophy

This project does not aim to replace traditional routing with SDN,
but to augment routing with SDN-based policy control in a unified platform.