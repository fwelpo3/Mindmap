class MindMap {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.workspace = document.getElementById('workspace');
        this.svg = document.getElementById('connections');

        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;

        // Transform state
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        this.minZoom = 0.2;
        this.maxZoom = 2.5;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };

        // Interaction state
        this.isDragging = false;
        this.isResizing = false;
        this.isConnecting = false;
        this.dragData = null;
        this.resizeData = null;
        this.connectionData = null;
        this.tempLine = null;

        this.animationFrame = null;

        this.init();
    }

    init() {
        this.initEventListeners();
        this.createInitialNode();
        this.updateSVGSize();
        // center workspace initially
        this.panX = (this.canvas.clientWidth - this.workspace.offsetWidth) / 2;
        this.panY = (this.canvas.clientHeight - this.workspace.offsetHeight) / 2;
        this.updateWorkspaceTransform();

        document.body.tabIndex = 0;
        document.body.focus();
    }

    initEventListeners() {
        // Toolbar events
        document.getElementById('addNodeBtn').addEventListener('click', () => this.addNodeAtCenter());
        const centerBtn = document.getElementById('centerBtn');
        if (centerBtn) centerBtn.addEventListener('click', () => this.centerView());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportMindmap());

        // Canvas events
        this.canvas.addEventListener('dblclick', (e) => this.handleCanvasDoubleClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleRightClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Document-level events for better dragging
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Prevent default drag behavior
        this.canvas.addEventListener('dragstart', e => e.preventDefault());
        this.canvas.addEventListener('selectstart', e => {
            if (this.isDragging || this.isResizing || this.isConnecting) {
                e.preventDefault();
            }
        });

        // Window events
        window.addEventListener('resize', () => this.updateSVGSize());
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    handleKeyDown(e) {
        if (this.selectedNode && (e.key === 'Delete' || e.key === 'Backspace')) {
            if (!this.selectedNode.input.matches(':focus')) {
                e.preventDefault();
                this.deleteNode(this.selectedNode);
            }
        }

        if (e.key === 'Escape') {
            this.cancelCurrentOperation();
        }

        if (e.key === 'Enter' && e.target.classList.contains('node-input')) {
            e.target.blur();
        }
    }

    cancelCurrentOperation() {
        if (this.isConnecting) {
            this.finishConnection(null);
        }
        if (this.isDragging) {
            this.handleMouseUp(null);
        }
        if (this.isResizing) {
            this.handleMouseUp(null);
        }
    }

    handleRightClick(e) {
        e.preventDefault();
        if (e.target.classList.contains('connection-line')) {
            this.deleteConnection(e.target);
        }
    }

    updateSVGSize() {
        const w = this.workspace ? this.workspace.offsetWidth : 5000;
        const h = this.workspace ? this.workspace.offsetHeight : 5000;
        this.svg.setAttribute('width', w);
        this.svg.setAttribute('height', h);
        this.updateConnections();
    }

    centerView() {
        if (this.nodes.length === 0) {
            this.zoom = 1;
            this.panX = (this.canvas.clientWidth - this.workspace.offsetWidth) / 2;
            this.panY = (this.canvas.clientHeight - this.workspace.offsetHeight) / 2;
            this.updateWorkspaceTransform();
            return;
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });

        const contentWidth = Math.max(1, maxX - minX);
        const contentHeight = Math.max(1, maxY - minY);

        const zoomForWidth = (this.canvas.clientWidth * 0.8) / contentWidth;
        const zoomForHeight = (this.canvas.clientHeight * 0.8) / contentHeight;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(zoomForWidth, zoomForHeight)));

        this.zoom = newZoom;

        const contentCenterX = minX + contentWidth / 2;
        const contentCenterY = minY + contentHeight / 2;

        this.panX = this.canvas.clientWidth / 2 - contentCenterX * this.zoom;
        this.panY = this.canvas.clientHeight / 2 - contentCenterY * this.zoom;

        this.updateWorkspaceTransform();
    }

    createInitialNode() {
        const w = this.workspace ? this.workspace.offsetWidth : 5000;
        const h = this.workspace ? this.workspace.offsetHeight : 5000;
        this.addNode(w / 2 - 60, h / 2 - 25, 'Hauptidee');
    }

    addNodeAtCenter() {
        const x = window.innerWidth / 2 - 60 + (Math.random() - 0.5) * 100;
        const y = window.innerHeight / 2 - 25 + (Math.random() - 0.5) * 100;
        const node = this.addNode(x, y, 'Neue Idee');
        setTimeout(() => { node.input.focus(); node.input.select(); }, 100);
    }

    handleCanvasDoubleClick(e) {
        if (e.target === this.canvas || e.target === this.svg || e.target === this.workspace) {
            const pos = this.screenToWorkspace(e.clientX, e.clientY);
            const node = this.addNode(pos.x - 60, pos.y - 25, 'Neue Idee');
            setTimeout(() => { node.input.focus(); node.input.select(); }, 100);
        }
    }

    addNode(x, y, text = 'Neue Idee') {
        const node = document.createElement('div');
        node.className = 'node';
        node.style.left = x + 'px';
        node.style.top = y + 'px';

        const input = document.createElement('textarea');
        input.className = 'node-input';
        input.value = text;
        input.spellcheck = false;

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';

        const connectionHandles = document.createElement('div');
        connectionHandles.className = 'connection-handles';
        const handlePositions = ['top', 'bottom', 'left', 'right'];
        const handles = {};
        handlePositions.forEach(position => {
            const handle = document.createElement('div');
            handle.className = `connection-handle ${position}`;
            handle.title = `Verbindung von ${position} erstellen`;
            handles[position] = handle;
            connectionHandles.appendChild(handle);
        });

        node.append(input, resizeHandle, connectionHandles);
        this.workspace.appendChild(node);

        const nodeData = {
            element: node,
            input,
            resizeHandle,
            handles,
            id: Date.now() + Math.random(),
            x,
            y,
            width: 120,
            height: 50
        };

        this.nodes.push(nodeData);
        this.setupNodeEvents(nodeData);
        this.adjustNodeSize(nodeData);
        return nodeData;
    }

    setupNodeEvents(nodeData) {
        const { element, input, resizeHandle, handles } = nodeData;

        element.addEventListener('mousedown', (e) => {
            if (e.target === resizeHandle || Object.values(handles).includes(e.target)) return;
            if (e.target === input) return;
            this.selectNode(nodeData);
            this.startDrag(e, nodeData);
        });

        element.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (e.target !== input) {
                input.focus();
                input.select();
            }
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startResize(e, nodeData);
        });

        Object.entries(handles).forEach(([position, handle]) => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startConnection(e, nodeData, position);
            });
        });

        input.addEventListener('input', () => this.adjustNodeSize(nodeData));
        input.addEventListener('focus', () => this.selectNode(nodeData));
        input.addEventListener('blur', () => this.adjustNodeSize(nodeData));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                input.blur();
            }
        });
    }

    selectNode(nodeData) {
        if (this.selectedNode) {
            this.selectedNode.element.classList.remove('selected');
        }
        this.selectedNode = nodeData;
        nodeData.element.classList.add('selected');
    }

    adjustNodeSize(nodeData) {
        const input = nodeData.input;
        const element = nodeData.element;

        const measurer = document.createElement('div');
        measurer.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            font: ${window.getComputedStyle(input).font};
            padding: 12px 16px;
            border: 2px solid transparent;
            border-radius: 16px;
            min-width: 120px;
            max-width: 400px;
            word-wrap: break-word;
        `;
        measurer.textContent = input.value || 'A';
        document.body.appendChild(measurer);

        const newWidth = Math.max(120, Math.min(400, measurer.offsetWidth));
        const newHeight = Math.max(50, measurer.offsetHeight);
        document.body.removeChild(measurer);

        nodeData.width = newWidth;
        nodeData.height = newHeight;
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
        this.scheduleConnectionUpdate();
    }

    scheduleConnectionUpdate() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.animationFrame = requestAnimationFrame(() => this.updateConnections());
    }

    startDrag(e, nodeData) {
        this.isDragging = true;
        this.dragData = {
            node: nodeData,
            startX: nodeData.x,
            startY: nodeData.y,
            mouseStartX: e.clientX,
            mouseStartY: e.clientY
        };
        nodeData.element.classList.add('dragging');
        document.body.classList.add('no-select');
        this.canvas.classList.add('cursor-grabbing');
        e.preventDefault();
    }

    startResize(e, nodeData) {
        this.isResizing = true;
        this.resizeData = {
            node: nodeData,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: nodeData.width,
            startHeight: nodeData.height
        };
        document.body.classList.add('no-select');
        this.canvas.classList.add('cursor-resize');
        e.preventDefault();
    }

    startConnection(e, nodeData, position) {
        this.isConnecting = true;
        this.connectionData = {
            fromNode: nodeData,
            fromPosition: position,
            fromHandle: nodeData.handles[position]
        };
        nodeData.handles[position].classList.add('connecting');
        this.canvas.classList.add('cursor-crosshair');
        this.createTempLine();
        e.preventDefault();
    }

    createTempLine() {
        this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.tempLine.classList.add('temp-line');
        this.svg.appendChild(this.tempLine);
    }

    handleMouseDown(e) {
        if (e.target === this.canvas || e.target === this.svg || e.target === this.workspace) {
            this.clearSelection();
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            document.body.classList.add('panning');
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            this.panX = e.clientX - this.panStart.x;
            this.panY = e.clientY - this.panStart.y;
            this.updateWorkspaceTransform();
            return;
        }
        if (this.isDragging && this.dragData) {
            e.preventDefault();
            const dx = (e.clientX - this.dragData.mouseStartX) / this.zoom;
            const dy = (e.clientY - this.dragData.mouseStartY) / this.zoom;
            const newX = this.dragData.startX + dx;
            const newY = this.dragData.startY + dy;
            this.dragData.node.x = newX;
            this.dragData.node.y = newY;
            this.dragData.node.element.style.left = newX + 'px';
            this.dragData.node.element.style.top = newY + 'px';
            this.scheduleConnectionUpdate();
            return;
        }
        if (this.isResizing && this.resizeData) {
            e.preventDefault();
            const deltaX = (e.clientX - this.resizeData.startX) / this.zoom;
            const deltaY = (e.clientY - this.resizeData.startY) / this.zoom;
            const newWidth = Math.max(100, Math.min(500, this.resizeData.startWidth + deltaX));
            const newHeight = Math.max(40, Math.min(300, this.resizeData.startHeight + deltaY));
            this.resizeData.node.width = newWidth;
            this.resizeData.node.height = newHeight;
            this.resizeData.node.element.style.width = newWidth + 'px';
            this.resizeData.node.element.style.height = newHeight + 'px';
            this.scheduleConnectionUpdate();
            return;
        }
        if (this.isConnecting && this.tempLine) {
            e.preventDefault();
            const fromPoint = this.getHandlePosition(this.connectionData.fromNode, this.connectionData.fromPosition);
            const mousePos = this.screenToWorkspace(e.clientX, e.clientY);
            this.tempLine.setAttribute('x1', fromPoint.x);
            this.tempLine.setAttribute('y1', fromPoint.y);
            this.tempLine.setAttribute('x2', mousePos.x);
            this.tempLine.setAttribute('y2', mousePos.y);
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            document.body.classList.remove('panning');
        }
        if (this.isDragging) {
            this.isDragging = false;
            if (this.dragData) {
                this.dragData.node.element.classList.remove('dragging');
                this.dragData = null;
            }
            document.body.classList.remove('no-select');
            this.canvas.classList.remove('cursor-grabbing');
        }
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeData = null;
            document.body.classList.remove('no-select');
            this.canvas.classList.remove('cursor-resize');
        }
        if (this.isConnecting) {
            this.finishConnection(e);
        }
    }

    // --- Zoom & Pan ---
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.zoomAt(mouseX, mouseY, zoomFactor);
    }

    zoomAt(mouseX, mouseY, factor) {
        const oldZoom = this.zoom;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
        if (newZoom === oldZoom) return;
        this.panX = mouseX - (mouseX - this.panX) * (newZoom / oldZoom);
        this.panY = mouseY - (mouseY - this.panY) * (newZoom / oldZoom);
        this.zoom = newZoom;
        this.updateWorkspaceTransform();
    }

    updateWorkspaceTransform() {
        if (this.workspace) {
            this.workspace.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        }
        const level = document.getElementById('zoomLevel');
        if (level) level.textContent = `${Math.round(this.zoom * 100)}%`;
        this.updateConnections();
    }

    screenToWorkspace(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.zoom,
            y: (screenY - this.panY) / this.zoom
        };
    }

    finishConnection(e) {
        let targetHandle = null;
        if (e && e.target) {
            targetHandle = this.findTargetHandle(e.target);
        }
        if (targetHandle && targetHandle.node !== this.connectionData.fromNode) {
            this.createConnection(
                this.connectionData.fromNode,
                this.connectionData.fromPosition,
                targetHandle.node,
                targetHandle.position
            );
        }
        this.connectionData.fromHandle.classList.remove('connecting');
        if (this.tempLine) {
            this.svg.removeChild(this.tempLine);
            this.tempLine = null;
        }
        this.isConnecting = false;
        this.connectionData = null;
        this.canvas.classList.remove('cursor-crosshair');
    }

    findTargetHandle(element) {
        if (element && element.classList && element.classList.contains('connection-handle')) {
            const node = this.nodes.find(n => Object.values(n.handles).includes(element));
            if (node) {
                const position = Object.keys(node.handles).find(key => node.handles[key] === element);
                return { node, position };
            }
        }
        return null;
    }

    createConnection(fromNode, fromPosition, toNode, toPosition) {
        const exists = this.connections.some(conn =>
            (conn.from === fromNode && conn.to === toNode) ||
            (conn.from === toNode && conn.to === fromNode)
        );
        if (!exists) {
            this.connections.push({
                from: fromNode,
                to: toNode,
                fromPosition,
                toPosition,
                id: Date.now() + Math.random()
            });
            this.updateConnections();
        }
    }

    getHandlePosition(node, position) {
        const x = node.x;
        const y = node.y;
        const width = node.width;
        const height = node.height;
        switch (position) {
            case 'top': return { x: x + width / 2, y: y };
            case 'bottom': return { x: x + width / 2, y: y + height };
            case 'left': return { x: x, y: y + height / 2 };
            case 'right': return { x: x + width, y: y + height / 2 };
            default: return { x: x + width / 2, y: y + height / 2 };
        }
    }

    updateConnections() {
        const tempLine = this.tempLine;
        this.svg.innerHTML = '';
        if (tempLine) this.svg.appendChild(tempLine);
        this.connections.forEach((connection, index) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.classList.add('connection-line');
            line.dataset.connectionIndex = index;
            line.dataset.connectionId = connection.id;
            const from = this.getHandlePosition(connection.from, connection.fromPosition);
            const to = this.getHandlePosition(connection.to, connection.toPosition);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const controlOffset = Math.min(distance * 0.25, 60);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            let controlX = midX;
            let controlY = midY - controlOffset;
            if (connection.fromPosition === 'left' && connection.toPosition === 'right') {
                controlY = midY;
            } else if (connection.fromPosition === 'right' && connection.toPosition === 'left') {
                controlY = midY;
            }
            const d = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
            line.setAttribute('d', d);
            this.svg.appendChild(line);
        });
    }

    deleteConnection(lineElement) {
        const connectionIndex = parseInt(lineElement.dataset.connectionIndex);
        if (connectionIndex >= 0 && connectionIndex < this.connections.length) {
            this.connections.splice(connectionIndex, 1);
            this.updateConnections();
        }
    }

    deleteNode(nodeData) {
        const index = this.nodes.indexOf(nodeData);
        if (index > -1) {
            this.connections = this.connections.filter(conn => conn.from !== nodeData && conn.to !== nodeData);
            nodeData.element.remove();
            this.nodes.splice(index, 1);
            if (this.selectedNode === nodeData) this.selectedNode = null;
            this.updateConnections();
        }
    }

    clearSelection() {
        if (this.selectedNode) {
            this.selectedNode.element.classList.remove('selected');
            this.selectedNode = null;
        }
    }

    clearAll() {
        if (this.nodes.length === 0) return;
        const result = confirm('Möchten Sie wirklich alle Knoten und Verbindungen löschen?');
        if (result) {
            this.nodes.forEach(node => node.element.remove());
            this.nodes = [];
            this.connections = [];
            this.selectedNode = null;
            this.updateConnections();
            setTimeout(() => this.createInitialNode(), 100);
        }
    }

    exportMindmap() {
        const mindmapData = {
            nodes: this.nodes.map(node => ({
                id: node.id,
                x: node.x,
                y: node.y,
                width: node.width,
                height: node.height,
                text: node.input.value
            })),
            connections: this.connections.map(conn => ({
                id: conn.id,
                fromId: conn.from.id,
                toId: conn.to.id,
                fromPosition: conn.fromPosition,
                toPosition: conn.toPosition
            })),
            timestamp: new Date().toISOString()
        };
        const dataStr = JSON.stringify(mindmapData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mindmap_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showNotification('Mindmap erfolgreich exportiert!');
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 50%;
            transform: translateX(50%);
            background: rgba(76, 175, 80, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);
        setTimeout(() => { notification.remove(); style.remove(); }, 3000);
    }

    cleanup() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('keydown', this.handleKeyDown);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.mindmap = new MindMap();
    } catch (error) {
        console.error('Failed to initialize mindmap:', error);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(244, 67, 54, 0.9);
            color: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            backdrop-filter: blur(10px);
            z-index: 10000;
        `;
        errorDiv.innerHTML = `
            <h3>Fehler beim Laden der Mindmap</h3>
            <p>Bitte laden Sie die Seite neu.</p>
            <button onclick="location.reload()" style="
                background: white;
                color: #f44336;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            ">Neu laden</button>
        `;
        document.body.appendChild(errorDiv);
    }
});


